import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Mark } from "@/components/brand/Logo";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import { newSessionAgentQuery } from "@/ipc/queries";

import { MessageBox } from "./MessageBox";
import { useSendMessage } from "./useSendMessage";
import { useStartSession } from "./useStartSession";

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
 * agent a new session takes (ADR 0039), the message box and three shortcuts. Sending from it starts
 * a session with that agent in the Playground, opens it and sends the message.
 */
export function Welcome() {
  const { t } = useTranslation();
  const startSession = useStartSession();
  const send = useSendMessage();
  // Until Rust has answered, or where there is no Rust, the Demo agent.
  const agent = useQuery(newSessionAgentQuery).data ?? "demo";

  const start = async (text: string) => {
    const id = await startSession(agent);
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
        context={t("sessions.context", {
          agent: t(`agents.${agent}.name`),
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
