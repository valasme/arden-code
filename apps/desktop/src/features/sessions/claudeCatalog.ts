import type { Catalog, Effort, Model, ModelOption } from "@/ipc/bindings";

/** What is known before Claude Code has said anything. */
export const emptyCatalog: Catalog = { commands: [], models: [], terminalCommands: [] };

/** Every effort, in the order the menu lists them. */
export const allEfforts = [
  "low",
  "medium",
  "high",
  "extraHigh",
  "max",
] as const satisfies readonly Effort[];

/**
 * The models Claude Code lists, apart from Default, in two parts (ADR 0042): the families, as it
 * lists them first, up to its last alias such as `haiku`, and the older versions that follow, which
 * it names by their full ids.
 */
export function splitModels(models: readonly ModelOption[]): {
  listed: ModelOption[];
  older: ModelOption[];
} {
  const rows = models.filter((row) => row.value !== "default");
  const lastFamily = rows.findLastIndex((row) => !row.value.startsWith("claude-"));
  return { listed: rows.slice(0, lastFamily + 1), older: rows.slice(lastFamily + 1) };
}

/**
 * The efforts the chosen model takes (ADR 0042), or those of the Default model for Default. Every
 * effort while Claude Code has not listed its models, or does not list this one: it may still run.
 */
export function effortsFor(catalog: Catalog, model: Model | null): readonly Effort[] {
  const row = catalog.models.find((candidate) => candidate.value === (model ?? "default"));
  return row ? row.efforts : allEfforts;
}
