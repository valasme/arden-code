import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";

/**
 * A command's shortcut at the end of a row, for the eye only: the command's tooltip and the
 * cheat sheet tell assistive technology about it, so it stays out of the row's name. In a narrow
 * sidebar it steps aside, so the row's own text keeps its room (#128).
 */
export function ShortcutHint({ command }: { command: CommandId }) {
  const [shortcut] = useShortcutsOf(command);
  if (!shortcut) return null;
  return (
    <span
      aria-hidden
      className="ms-auto hidden shrink-0 text-2xs text-muted-foreground @min-[13rem]/sidebar:inline"
    >
      {formatShortcut(shortcut)}
    </span>
  );
}
