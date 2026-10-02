import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Mark } from "@/components/brand/Logo";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import { commands } from "@/ipc/bindings";
import { projectsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { MessageBox } from "./MessageBox";
import { useSendMessage } from "./useSendMessage";

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
 * What the session view shows when no session is open (ADR 0032): the mark, a question, the line
 * about the Demo agent, the message box and three shortcuts. Sending from it starts a Demo agent
 * session in the Playground, opens it and sends the message.
 */
export function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const send = useSendMessage();

  const start = async (text: string) => {
    let id: string;
    try {
      ({ id } = await commands.createSession());
    } catch (error) {
      showErrorToast(toAppError(error));
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey });
    await navigate({ to: "/session/$id", params: { id } });
    await send(id, text);
    return true;
  };

  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-6">
      <Mark className="size-11" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold text-balance">{t("welcome.question")}</h1>
        <p className="text-sm text-muted-foreground">{t("welcome.line")}</p>
      </div>
      <MessageBox
        className="w-full max-w-[40rem] px-0 pb-0"
        ownArea={false}
        busy={false}
        context={t("sessions.context", {
          agent: t("sessions.demoAgent"),
          project: t("sessions.playground"),
        })}
        onSend={start}
        onStop={() => {}}
      />
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Hint command="palette.open" label={t("welcome.palette")} />
        <Hint command="session.new" label={t("welcome.newSession")} />
        <Hint command="settings.open" label={t("welcome.settings")} />
      </ul>
    </main>
  );
}
