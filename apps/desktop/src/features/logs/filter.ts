import type { Entry } from "@/ipc/bindings";

/** From the most serious to the least. */
export const levels = ["error", "warn", "info", "debug", "trace"] as const;

export type LogLevelName = (typeof levels)[number];

export interface LogFilter {
  /** Shows this level and everything more serious; `all` shows every level. */
  level: LogLevelName | "all";
  /** One source, or `all`. */
  source: string;
  /** Words that must all be in the entry's message, source or code. */
  text: string;
}

export const noFilter: LogFilter = { level: "all", source: "all", text: "" };

/** The level's name when it is one of the known ones. */
export const levelNameOf = (level: string): LogLevelName | undefined =>
  levels.find((name) => name === level);

const rank = (level: string): number => {
  const position = levels.findIndex((name) => name === level);
  return position === -1 ? levels.length : position;
};

/** The entries that pass the filter, in their order. */
export function filterEntries(entries: readonly Entry[], filter: LogFilter): Entry[] {
  const words = filter.text.toLowerCase().split(/\s+/u).filter(Boolean);
  const limit = filter.level === "all" ? levels.length : rank(filter.level);

  return entries.filter((entry) => {
    if (rank(entry.level) > limit) return false;
    if (filter.source !== "all" && entry.source !== filter.source) return false;
    const haystack = `${entry.message} ${entry.source} ${entry.code ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The sources that appear in the entries, sorted. */
export function sourcesOf(entries: readonly Entry[]): string[] {
  return [...new Set(entries.map((entry) => entry.source))].toSorted((a, b) => a.localeCompare(b));
}
