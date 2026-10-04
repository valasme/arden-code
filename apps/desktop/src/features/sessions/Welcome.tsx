import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Mark } from "@/components/brand/Logo";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import { type AgentKind, commands, type Project } from "@/ipc/bindings";
import { agentForProjectQuery, noSessions, sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { AgentMenu } from "./AgentMenu";
import { MessageBox } from "./MessageBox";
import { ProjectMenu } from "./ProjectMenu";
import { latestProjectId, projectsByUse } from "./sessionList";
import { TrustDialog } from "./TrustDialog";
import { useOpenFolder } from "./useOpenFolder";
import { useSendMessage } from "./useSendMessage";
import { useStartSession } from "./useStartSession";
import { useUnavailableAgents } from "./useUnavailableAgents";

const PLAYGROUND_ID = "playground";

function Hint({ command, label }: { command: CommandId; label: string }) {
  const [shortcut] = useShortcutsOf(command);

  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      {shortcut ? <Kbd>{formatShortcut(shortcut)}</Kbd> : null}
      {label}
    </li>
  );
}

/**
 * What the session view shows when no session is open (ADR 0032): the mark, a question naming the
 * chosen agent, the message box with the agent and project menus of an empty session, and three
 * shortcuts. The project starts as the project of the latest session, else the Playground, and the
 * agent as a new session there would take, until the person chooses one (councils Q1). Sending
 * starts a session with them, opens it and sends the message; Claude first asks to trust a folder.
 */
export function Welcome() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const startSession = useStartSession();
  const send = useSendMessage();
  const openFolder = useOpenFolder();
  const unavailable = useUnavailableAgents();
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const [chosenProject, setChosenProject] = useState<string | undefined>(undefined);
  const [chosenAgent, setChosenAgent] = useState<AgentKind | undefined>(undefined);
  /** A message that waits for the person to trust the chosen folder, and how to say what became of it. */
  const [trusting, setTrusting] = useState<{
    text: string;
    sent: (sent: boolean) => void;
  } | null>(null);

  const projectId = chosenProject ?? latestProjectId(list) ?? PLAYGROUND_ID;
  const project: Project | undefined = list.projects.find(
    (listing) => listing.project.id === projectId,
  )?.project;
  // Until Rust has answered, or where there is no Rust, the Demo agent.
  const ruled = useQuery(agentForProjectQuery(projectId)).data ?? "demo";
  const agent = chosenAgent ?? ruled;

  const start = async (text: string) => {
    const id = await startSession(agent, projectId);
    if (id === undefined) return false;
    await send(id, text);
    return true;
  };

  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-6">
      <Mark className="size-11" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold text-balance">{t(`agents.${agent}.question`)}</h1>
      </div>
      <MessageBox
        className="w-full max-w-[40rem] px-0 pb-0"
        ownArea={false}
        agent={agent}
        busy={false}
        context={
          <span className="flex min-w-0 items-center gap-1.5">
            <AgentMenu agent={agent} unavailable={unavailable} onChoose={setChosenAgent} />
            <ProjectMenu
              projectId={projectId}
              projects={projectsByUse(list)}
              onChoose={setChosenProject}
              onOpenFolder={() => {
                void openFolder().then((opened) => {
                  if (opened) setChosenProject(opened.id);
                });
              }}
            />
          </span>
        }
        onSend={(text) => {
          // Claude first works in a folder only once the person trusts it (ADR 0039).
          if (agent === "claude" && project?.kind === "folder" && !project.trusted) {
            return new Promise<boolean>((sent) => {
              setTrusting({ text, sent });
            });
          }
          return start(text);
        }}
        onStop={() => {}}
      />
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Hint command="palette.open" label={t("welcome.palette")} />
        <Hint command="session.new" label={t("welcome.newSession")} />
        <Hint command="settings.open" label={t("welcome.settings")} />
      </ul>
      {trusting && project ? (
        <TrustDialog
          name={project.name}
          path={project.path}
          onAnswer={(trusted) => {
            setTrusting(null);
            if (!trusted) {
              trusting.sent(false);
              return;
            }
            commands
              .trustProject(project.id)
              .then(async () => {
                await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
                trusting.sent(await start(trusting.text));
              })
              .catch((failure: unknown) => {
                showErrorToast(toAppError(failure));
                trusting.sent(false);
              });
          }}
        />
      ) : null}
    </main>
  );
}
