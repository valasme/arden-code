import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";

/**
 * A command's shortcut at the end of a row, for the eye only: the command's tooltip and the
 * cheat sheet tell assistive technology about it, so it stays out of the row's name.
 */
export function ShortcutHint({ command }: { command: CommandId }) {
  const [shortcut] = useShortcutsOf(command);
  if (!shortcut) return null;
  return (
    <span aria-hidden className="ms-auto shrink-0 text-2xs text-muted-foreground">
      {formatShortcut(shortcut)}
    </span>
  );
}
