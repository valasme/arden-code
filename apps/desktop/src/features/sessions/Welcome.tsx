import { useTranslation } from "react-i18next";

import { Mark } from "@/components/brand/Logo";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";

function Hint({ command, label }: { command: CommandId; label: string }) {
  const [shortcut] = useShortcutsOf(command);

  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      {shortcut ? (
        <kbd className="border border-border bg-muted px-1.5 py-0.5 font-sans text-foreground">
          {formatShortcut(shortcut)}
        </kbd>
      ) : null}
      {label}
    </li>
  );
}

/** What the session view shows when no session is open: the logo, one line, three shortcuts. */
export function Welcome() {
  const { t } = useTranslation();

  return (
    <main className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <Mark className="size-14" />
      <h1 className="text-base font-medium">{t("welcome.line")}</h1>
      <ul className="flex flex-col items-start gap-2">
        <Hint command="palette.open" label={t("welcome.palette")} />
        <Hint command="session.new" label={t("welcome.newSession")} />
        <Hint command="settings.open" label={t("welcome.settings")} />
      </ul>
    </main>
  );
}
