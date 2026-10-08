import type { Catalog, Effort, Model, SlashCommand } from "@/ipc/bindings";

/**
 * The commands that only make sense in Claude Code's own terminal, until it has said which: what
 * it said in 2.1.292. Claude Code's own list replaces this (ADR 0042).
 */
const terminalBefore = ["doctor", "color", "focus", "reload-plugins"];
/** Internal commands of Claude Code that are not for a person to run. */
const internal = (name: string) => name.startsWith("__") || name === "workflow-launch-exec";

/** The letters of a name without what separates its words, in lower case. */
const compact = (text: string) => text.toLowerCase().replaceAll(/[:_-]/g, "");

/** What follows the slash while the person is still typing the command's name, else null. */
export function menuQuery(text: string): string | null {
  return text.startsWith("/") && !/\s/.test(text) ? text.slice(1) : null;
}

/** How well a command's names match the letters typed: 0 is the best, null is no match. */
function rank(command: SlashCommand, letters: string): number | null {
  if (letters === "") return 0;
  if (compact(command.name).startsWith(letters)) return 0;
  if (command.aliases.some((alias) => compact(alias).startsWith(letters))) return 1;
  const words = command.name.split(/[:_-]/);
  if (words.some((word) => compact(word).startsWith(letters))) return 2;
  return null;
}

/**
 * The commands that match what was typed after the slash, as Claude Code's own menu matches them
 * (ADR 0042): the start of a name, an alias, or a word within a name, ignoring `:`, `_` and `-`
 * and the case. Those that start with the letters come first; Claude Code's order is kept within
 * each kind. Internal commands and those that are bound to a terminal are left out.
 */
export function filterSlashCommands(
  commands: readonly SlashCommand[],
  terminalCommands: readonly string[],
  query: string,
): SlashCommand[] {
  const hidden = terminalCommands.length > 0 ? terminalCommands : terminalBefore;
  const letters = compact(query);
  return commands
    .filter((command) => !internal(command.name) && !hidden.includes(command.name))
    .map((command, order) => ({ command, order, rank: rank(command, letters) }))
    .filter(
      (match): match is { command: SlashCommand; order: number; rank: number } =>
        match.rank !== null,
    )
    .toSorted((a, b) => a.rank - b.rank || a.order - b.order)
    .map((match) => match.command);
}

/** Where a command comes from, for the menu to say. */
export type Source =
  | { kind: "builtin" }
  | { kind: "plugin"; name: string }
  | { kind: "mcp" }
  | { kind: "skill" };

export function sourceOf(command: SlashCommand): Source {
  if (command.builtin) return { kind: "builtin" };
  if (command.name.endsWith("(MCP)")) return { kind: "mcp" };
  const colon = command.name.indexOf(":");
  if (colon > 0) return { kind: "plugin", name: command.name.slice(0, colon) };
  return { kind: "skill" };
}

/** What Arden Code runs itself instead of sending it to Claude Code (ADR 0042). */
export interface LocalCommand {
  kind: "model" | "effort" | "rename" | "clear";
  argument: string;
}

const local: Record<string, LocalCommand["kind"]> = {
  model: "model",
  effort: "effort",
  rename: "rename",
  clear: "clear",
  reset: "clear",
  new: "clear",
};

/** The command a message is, when Arden Code runs it itself. */
export function parseLocalCommand(text: string): LocalCommand | null {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  const kind = match?.[1] ? local[match[1].toLowerCase()] : undefined;
  if (!kind) return null;
  // Only what is typed after the name, the line ends of a multi-line message included, is kept.
  return { kind, argument: (match?.[2] ?? "").trim() };
}

/** The families Claude Code takes by alias, before it has listed its models. */
const families = new Set(["fable", "opus", "sonnet", "haiku"]);

/**
 * The model a `/model` argument means: a value, a display name or a full id that Claude Code lists,
 * or Default. Nothing for what Claude Code does not list, since the model is never typed text
 * (ADR 0042).
 */
export function resolveModel(catalog: Catalog, argument: string): { model: Model | null } | null {
  const wanted = argument.trim().toLowerCase();
  if (wanted === "") return null;
  if (wanted === "default") return { model: null };
  const rows = catalog.models.filter((row) => row.value !== "default");
  if (rows.length === 0) {
    return families.has(wanted) ? { model: wanted } : null;
  }
  const found =
    rows.find((row) => row.value.toLowerCase() === wanted) ??
    rows.find((row) => row.displayName.toLowerCase() === wanted) ??
    rows.find((row) => row.resolvedModel?.toLowerCase() === wanted);
  return found ? { model: found.value } : null;
}

const efforts: Record<string, Effort | null> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "extraHigh",
  max: "max",
  auto: null,
  default: null,
};

/** The effort a `/effort` argument means, by Claude Code's words, `auto` meaning its own setting. */
export function resolveEffort(argument: string): { effort: Effort | null } | null {
  const wanted = argument.trim().toLowerCase();
  return wanted in efforts ? { effort: efforts[wanted] ?? null } : null;
}
