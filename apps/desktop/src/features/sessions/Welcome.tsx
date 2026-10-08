import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Mark } from "@/components/brand/Logo";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import { type AgentKind, commands, type Effort, type Model, type Project } from "@/ipc/bindings";
import {
  agentForProjectQuery,
  effortForProjectQuery,
  modelForProjectQuery,
  noSessions,
  sessionListQuery,
} from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { AgentMenu } from "./AgentMenu";
import { EffortMenu } from "./EffortMenu";
import { MessageBox } from "./MessageBox";
import { ModelMenu } from "./ModelMenu";
import { ProjectMenu } from "./ProjectMenu";
import { latestProjectId, PLAYGROUND_ID, projectsByUse } from "./sessionList";
import { useOpenFolder } from "./useOpenFolder";
import { useSendMessage } from "./useSendMessage";
import { effortsFor } from "./claudeCatalog";
import { useClaudeCatalog } from "./useClaudeCatalog";
import { useLocalCommands } from "./useLocalCommands";
import { useStartSession } from "./useStartSession";
import { useTrustGate } from "./useTrustGate";
import { useUltrathink } from "./ultrathink";
import { useUnavailableAgents } from "./useUnavailableAgents";

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
  const startSession = useStartSession();
  const send = useSendMessage();
  const openFolder = useOpenFolder();
  const unavailable = useUnavailableAgents();
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const [chosenProject, setChosenProject] = useState<string | undefined>(undefined);
  const [chosenAgent, setChosenAgent] = useState<AgentKind | undefined>(undefined);
  const [chosenModel, setChosenModel] = useState<Model | null | undefined>(undefined);
  const [chosenEffort, setChosenEffort] = useState<Effort | null | undefined>(undefined);
  const { gate, dialog: trustDialog } = useTrustGate();
  const { ultrathink, setUltrathink, carrying } = useUltrathink();

  const projectId = chosenProject ?? latestProjectId(list) ?? PLAYGROUND_ID;
  const project: Project | undefined = list.projects.find(
    (listing) => listing.project.id === projectId,
  )?.project;
  // Until Rust has answered, or where there is no Rust, the Demo agent.
  const ruled = useQuery(agentForProjectQuery(projectId)).data ?? "demo";
  const agent = chosenAgent ?? ruled;
  // The model a new session there takes, until the person chooses one (ADR 0041).
  const inheritedModel = useQuery(modelForProjectQuery(projectId)).data ?? null;
  const model = chosenModel === undefined ? inheritedModel : chosenModel;
  const inheritedEffort = useQuery(effortForProjectQuery(projectId)).data ?? null;
  const effort = chosenEffort === undefined ? inheritedEffort : chosenEffort;
  const catalog = useClaudeCatalog(agent === "claude");
  const runLocal = useLocalCommands();

  const start = async (text: string) => {
    const id = await startSession(agent, projectId);
    if (id === undefined) return false;
    // The session takes the inherited model and effort by itself; one chosen here is given
    // before the message.
    try {
      if (agent === "claude" && chosenModel !== undefined) {
        await commands.setSessionModel(id, chosenModel);
      }
      if (agent === "claude" && chosenEffort !== undefined) {
        await commands.setSessionEffort(id, chosenEffort);
      }
    } catch (error) {
      showErrorToast(toAppError(error));
    }
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
            {agent === "claude" ? (
              <>
                <ModelMenu model={model} models={catalog.models} onChoose={setChosenModel} />
                <EffortMenu
                  effort={effort}
                  levels={effortsFor(catalog, model)}
                  ultrathink={ultrathink}
                  onUltrathink={setUltrathink}
                  onChoose={setChosenEffort}
                />
              </>
            ) : null}
          </span>
        }
        {...(agent === "claude"
          ? { slash: { commands: catalog.commands, terminalCommands: catalog.terminalCommands } }
          : {})}
        onSend={carrying((text) => {
          // There is no session yet to rename or clear (ADR 0042).
          const ran =
            agent === "claude" &&
            runLocal(text, {
              catalog,
              chooseModel: setChosenModel,
              chooseEffort: setChosenEffort,
              clear: () => undefined,
            });
          return ran || gate(agent, project, () => start(text));
        })}
        onStop={() => {}}
      />
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Hint command="palette.open" label={t("welcome.palette")} />
        <Hint command="session.new" label={t("welcome.newSession")} />
        <Hint command="settings.open" label={t("welcome.settings")} />
      </ul>
      {trustDialog}
    </main>
  );
}
