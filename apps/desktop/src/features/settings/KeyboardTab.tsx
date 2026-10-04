import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkShortcut,
  formatShortcut,
  shortcutFromEvent,
  type ShortcutProblem,
} from "@/features/commands/shortcuts";
import {
  commandDefinitions,
  effectiveShortcuts,
  MAX_SHORTCUTS_PER_COMMAND,
  type CommandDefinition,
  type CommandId,
} from "@/features/commands/registry";

import { matchesSearch } from "@/lib/search";
import { useResetShortcuts, useSetShortcuts } from "./useShortcuts";
import { useSettings } from "./useSettings";

/** The shortcut being recorded: which command, and which of its shortcuts (or a new one). */
interface Recording {
  command: CommandId;
  slot: number | "new";
}

/** Something the person has to look at before a recorded shortcut can be used. */
type Notice =
  | { kind: "problem"; problem: ShortcutProblem; shortcut: string }
  | { kind: "conflict"; shortcut: string; other: CommandId };

/** A command as the tab shows it. */
function described(
  definition: CommandDefinition,
  label: string,
  shortcuts: readonly string[],
  changed: Partial<Record<string, readonly string[]>>,
) {
  return { ...definition, label, shortcuts, modified: definition.id in changed };
}

const idOf = (recording: Recording) => `shortcut-${recording.command}-${recording.slot}`;

const chipClass =
  "border border-border bg-muted px-1.5 py-0.5 font-sans text-xs hover:bg-border forced-colors:hover:outline forced-colors:hover:outline-1";

/**
 * Settings → Keyboard: every command with its shortcuts. Clicking a shortcut records a new one.
 * Shortcuts that Windows keeps, that edit text, or that another command already has are flagged
 * before they are saved.
 */
export function KeyboardTab() {
  const { t } = useTranslation();
  const changed = useSettings().keyboard.shortcuts;
  const setShortcuts = useSetShortcuts();
  const resetShortcuts = useResetShortcuts();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<Recording | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | undefined>(undefined);
  const [focusAfter, setFocusAfter] = useState<string | undefined>(undefined);

  const commands = commandDefinitions.map((definition) =>
    described(definition, t(definition.labelKey), effectiveShortcuts(definition, changed), changed),
  );
  const named = (id: CommandId) => commands.find((command) => command.id === id)?.label ?? id;

  const visible = commands.filter((command) =>
    matchesSearch(
      { label: command.label, description: command.shortcuts.map(formatShortcut).join(" ") },
      query,
    ),
  );

  const stopRecording = (focus?: string) => {
    setRecording(undefined);
    setNotice(undefined);
    setFocusAfter(focus);
  };

  const save = async (command: CommandId, shortcuts: readonly string[], focus: string) => {
    try {
      await setShortcuts.mutateAsync({ command, shortcuts });
    } catch {
      // The person was told, with the error code, and nothing changed.
    }
    stopRecording(focus);
  };

  // The shortcut that was recorded, in place of the one that was clicked (or added at the end).
  const withRecorded = (recorded: Recording, shortcut: string) => {
    const current = commands.find((command) => command.id === recorded.command)?.shortcuts ?? [];
    return recorded.slot === "new"
      ? [...current, shortcut]
      : current.map((existing, index) => (index === recorded.slot ? shortcut : existing));
  };

  const accept = (recorded: Recording, shortcut: string) => {
    const current = commands.find((command) => command.id === recorded.command)?.shortcuts ?? [];
    if (current.some((existing) => existing.toLowerCase() === shortcut.toLowerCase())) {
      stopRecording(idOf(recorded));
      return;
    }
    void save(recorded.command, withRecorded(recorded, shortcut), idOf(recorded));
  };

  // While a shortcut is being recorded, every key press is taken for it, and does nothing else.
  useEffect(() => {
    if (!recording || notice?.kind === "conflict") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
      if (event.key === "Escape" && bare) {
        stopRecording(idOf(recording));
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      const problem = checkShortcut(shortcut);
      if (problem) {
        setNotice({ kind: "problem", problem, shortcut });
        return;
      }
      const other = commands.find(
        (command) =>
          command.id !== recording.command &&
          command.shortcuts.some((existing) => existing.toLowerCase() === shortcut.toLowerCase()),
      );
      if (other) {
        setNotice({ kind: "conflict", shortcut, other: other.id });
        return;
      }
      accept(recording, shortcut);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

  useEffect(() => {
    if (focusAfter) document.getElementById(focusAfter)?.focus();
  }, [focusAfter]);

  const replaceOther = async (conflict: Extract<Notice, { kind: "conflict" }>) => {
    if (!recording) return;
    const other = commands.find((command) => command.id === conflict.other);
    try {
      await setShortcuts.mutateAsync({
        command: conflict.other,
        shortcuts: (other?.shortcuts ?? []).filter(
          (existing) => existing.toLowerCase() !== conflict.shortcut.toLowerCase(),
        ),
      });
      await setShortcuts.mutateAsync({
        command: recording.command,
        shortcuts: withRecorded(recording, conflict.shortcut),
      });
    } catch {
      // The person was told, with the error code.
    }
    stopRecording(idOf(recording));
  };

  const anyModified = commands.some((command) => command.modified);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="min-w-32 flex-1"
          type="search"
          aria-label={t("settings.keyboard.search.label")}
          placeholder={t("settings.keyboard.search.placeholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <Button
          variant="outline"
          disabled={!anyModified}
          onClick={() => {
            resetShortcuts.mutate(undefined);
          }}
        >
          {t("settings.keyboard.resetAll")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("settings.keyboard.empty")}</p>
      ) : (
        // A narrow window scrolls the table sideways, not the whole page.
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  {t("settings.keyboard.command")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {t("settings.keyboard.shortcuts")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((command) => {
                const isRecording = recording?.command === command.id;
                return (
                  <tr key={command.id} className="border-t border-border align-top">
                    <th scope="row" className="py-2 pr-4 text-left font-normal">
                      {command.label}
                    </th>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {command.shortcuts.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t("settings.keyboard.none")}
                          </span>
                        ) : null}
                        {command.shortcuts.map((shortcut, slot) => {
                          const here = { command: command.id, slot };
                          const active = isRecording && recording.slot === slot;
                          return (
                            <span key={shortcut} className="flex items-center">
                              <button
                                type="button"
                                id={idOf(here)}
                                className={chipClass}
                                aria-label={t("settings.keyboard.change", {
                                  shortcut: formatShortcut(shortcut),
                                  command: command.label,
                                })}
                                aria-pressed={active}
                                onClick={() => {
                                  setNotice(undefined);
                                  setRecording(here);
                                }}
                              >
                                {active
                                  ? t("settings.keyboard.pressKeys")
                                  : formatShortcut(shortcut)}
                              </button>
                              <button
                                type="button"
                                className="grid size-6 place-items-center hover:bg-muted"
                                aria-label={t("settings.keyboard.remove", {
                                  shortcut: formatShortcut(shortcut),
                                  command: command.label,
                                })}
                                onClick={() => {
                                  void save(
                                    command.id,
                                    command.shortcuts.filter((_, index) => index !== slot),
                                    idOf({ command: command.id, slot: "new" }),
                                  );
                                }}
                              >
                                <XIcon aria-hidden className="size-3" />
                              </button>
                            </span>
                          );
                        })}
                        {command.shortcuts.length < MAX_SHORTCUTS_PER_COMMAND ? (
                          <button
                            type="button"
                            id={idOf({ command: command.id, slot: "new" })}
                            className="grid size-6 place-items-center hover:bg-muted"
                            aria-label={t("settings.keyboard.add", { command: command.label })}
                            aria-pressed={isRecording && recording.slot === "new"}
                            onClick={() => {
                              setNotice(undefined);
                              setRecording({ command: command.id, slot: "new" });
                            }}
                          >
                            {isRecording && recording.slot === "new" ? (
                              <span className="px-1 text-xs">
                                {t("settings.keyboard.pressKeys")}
                              </span>
                            ) : (
                              <PlusIcon aria-hidden className="size-3" />
                            )}
                          </button>
                        ) : null}
                        {command.modified ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t("settings.keyboard.resetRow", { command: command.label })}
                            onClick={() => {
                              resetShortcuts.mutate(command.id);
                            }}
                          >
                            {t("settings.reset")}
                          </Button>
                        ) : null}
                      </div>
                      {isRecording ? (
                        <output className="mt-1 block text-xs text-muted-foreground">
                          {notice?.kind === "problem" ? (
                            <p>
                              {t(`settings.keyboard.problems.${notice.problem}`, {
                                shortcut: formatShortcut(notice.shortcut),
                              })}
                            </p>
                          ) : null}
                          {notice?.kind === "conflict" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <p>
                                {t("settings.keyboard.conflict", {
                                  shortcut: formatShortcut(notice.shortcut),
                                  command: named(notice.other),
                                })}
                              </p>
                              <Button
                                size="sm"
                                onClick={() => {
                                  void replaceOther(notice);
                                }}
                              >
                                {t("settings.keyboard.replace")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  stopRecording(idOf(recording));
                                }}
                              >
                                {t("settings.keyboard.cancel")}
                              </Button>
                            </div>
                          ) : (
                            <p>{t("settings.keyboard.recording")}</p>
                          )}
                        </output>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
