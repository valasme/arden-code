import { ArrowUpIcon, LightbulbIcon, SquareIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentKind, FileMatch, SlashCommand } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { useDraftsStore } from "@/state/drafts";

import { FileRow, MessageBoxList, SlashCommandRow, optionId } from "./MessageBoxList";
import { type CursorWord, wordAt } from "./cursorWord";
import { filterSlashCommands, skillsOf } from "./slashCommands";
import { holdsUltrathink } from "./ultrathink";
import { useFileMatches } from "./useFileMatches";

/** The key code some browsers report for a key that is part of an input method's composition. */
const COMPOSING_KEY_CODE = 229;

/**
 * How a path is mentioned: `@path`, or `@"path"` when it holds a space, as Claude Code writes it. A
 * path that holds a quote too is left unquoted: Claude Code has no escape for it.
 */
function mention(path: string): string {
  return /\s/.test(path) && !path.includes('"') ? `@"${path}"` : `@${path}`;
}

/** An option of the list above the box: a slash command, or a file to mention. */
type Choice = { kind: "command"; command: SlashCommand } | { kind: "file"; file: FileMatch };

interface MessageBoxProps {
  /**
   * Whose draft the box holds: the session's id, or the welcome state's (ADR 0046). What is
   * written stays with it while the box is away.
   */
  draft: string;
  /** Whether a reply is running: then the button stops it instead of sending. */
  busy: boolean;
  /** The agent the message goes to: the placeholder names it. */
  agent: AgentKind;
  /**
   * What the next message can change: the agent and project menus while the session is empty
   * (ADR 0039), then the agent's own menus, such as the model (ADR 0044).
   */
  choices: ReactNode;
  /**
   * The figures under the box, such as the usage limits (ADR 0044, ADR 0045). None (`null` or
   * absent) for an agent without, which then has no line for them.
   */
  figures?: ReactNode;
  /** Sends the message. Answering `false` (now or later) says it was not sent: the text comes back. */
  onSend: (text: string) => boolean | Promise<boolean>;
  onStop: () => void;
  /**
   * Whether the box is an area of its own for F6 (ADR 0024). In the welcome state it is the page's
   * content, so it belongs to the session view's area.
   */
  ownArea?: boolean;
  /**
   * The slash commands the agent has, which a message that starts with a slash lists (ADR 0042).
   * None for an agent that has none.
   */
  slash?: { commands: readonly SlashCommand[]; terminalCommands: readonly string[] };
  /**
   * The project whose files a word that starts with `@` lists (ADR 0052): the session's, or the
   * one chosen in the welcome state.
   */
  files?: { projectId: string };
  /**
   * The Ultrathink switch of an agent that has it (ADR 0042): whether it is on, and how to turn it
   * off from the chip that says the next message will carry the word (ADR 0044).
   */
  ultrathink?: { on: boolean; onTurnOff: () => void };
  className?: string;
}

/**
 * Where the person writes (ADR 0032): a block at least two lines tall, with a lower line that
 * holds what the next message can change, then Send, or Stop while a reply runs (ADR 0044). The
 * line wraps when the box is narrow, Send with the last menu; the figures sit under the box
 * (ADR 0045). Enter sends and Shift+Enter adds a line. Enter never sends while a character is
 * still being composed (an accent key, an input method for another script): that Enter confirms
 * the character.
 *
 * A word that starts with a slash, at the start of the message or after a space or line break,
 * lists the agent's slash commands above the box while the cursor is in it (ADR 0042, ADR 0052):
 * every command for the message's first word, only skills for a later one. The arrow keys move
 * through the list, Tab fills in the command, and Enter fills it in too, except that a first word
 * that is the whole message and takes no arguments is sent. Esc closes the list and keeps the
 * text. Filling in replaces only the word under the cursor.
 *
 * A word that starts with `@` lists the project's files the same way, and fills in `@` and the
 * path. While the list is open on a later word or a file mention, Enter never sends, even with
 * nothing to fill in.
 */
export function MessageBox({
  draft,
  agent,
  busy,
  choices,
  figures,
  onSend,
  onStop,
  ownArea = true,
  slash,
  files,
  ultrathink,
  className,
}: MessageBoxProps) {
  const { t } = useTranslation();
  const text = useDraftsStore((state) => state.texts[draft] ?? "");
  const setDraftText = useDraftsStore((state) => state.setText);
  const setText = (value: string) => {
    setDraftText(draft, value);
  };
  const box = useRef<HTMLTextAreaElement>(null);

  // A session opens ready to be written in, at the end of its draft.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  const canSend = !busy && text.trim() !== "";
  const hasFigures = figures !== undefined && figures !== null;
  // The next message will carry the word: the switch is on, or the word is in it. A slash command
  // never does.
  const carriesUltrathink =
    ultrathink !== undefined && !text.startsWith("/") && (ultrathink.on || holdsUltrathink(text));

  const send = (message = text.trim()) => {
    if (busy || message === "") return;
    setText("");
    void Promise.resolve(onSend(message)).then((sent) => {
      if (!sent) setText(message);
    });
  };

  // The list, while the cursor is in a word that starts with a slash or an `@` (ADR 0052).
  const listId = useId();
  const [cursor, setCursor] = useState(text.length);
  // Where the cursor goes once a filled-in word is in the box: after the render that puts it there.
  const placeCursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = placeCursor.current;
    if (at === null || !box.current) return;
    placeCursor.current = null;
    box.current.setSelectionRange(at, at);
  });
  // While a character is being composed, the list stays as it was when the composing began.
  const [composing, setComposing] = useState<{ word: CursorWord | null } | null>(null);
  const underCursor = composing ? composing.word : wordAt(text, cursor);
  // A word of a kind this box does not list is no word for the list.
  const word =
    underCursor && ((underCursor.sign === "/" && slash) || (underCursor.sign === "@" && files))
      ? underCursor
      : null;
  const foundFiles = useFileMatches(files?.projectId, word?.sign === "@" ? word.query : null);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [chosen, setChosen] = useState({ query: "", index: 0 });
  const query = word ? `${word.sign}${word.query}` : null;
  // The options, or null while the files are on their way.
  const options: Choice[] | null =
    word?.sign === "@"
      ? (foundFiles?.map((file) => ({ kind: "file" as const, file })) ?? null)
      : slash && word
        ? filterSlashCommands(
            word.first ? slash.commands : skillsOf(slash.commands),
            slash.terminalCommands,
            word.query,
          ).map((command) => ({ kind: "command" as const, command }))
        : [];
  const matches = options ?? [];
  // What the list says, for the kind of word it lists.
  const strings =
    word?.sign === "@"
      ? {
          label: t("sessions.files.label"),
          none: t("sessions.files.none"),
          count: (count: number) => t("sessions.files.count", { count }),
        }
      : {
          label: t("sessions.slash.label"),
          none: t("sessions.slash.none"),
          count: (count: number) => t("sessions.slash.count", { count }),
        };
  const wordKey = word ? `${String(word.start)}:${text}` : null;
  const listing = word !== null && dismissedAt !== wordKey;
  const active = chosen.query === query ? Math.min(chosen.index, matches.length - 1) : 0;
  /**
   * Puts what was chosen in place of the word under the cursor, with a space after it. A folder
   * gets none, and the list stays open on what is in it; the cursor stays inside the quotes of a
   * quoted one.
   */
  const fill = (choice: Choice) => {
    if (!word) return;
    const after = text.slice(word.end);
    const filled =
      choice.kind === "command" ? `/${choice.command.name}` : mention(choice.file.path);
    const staysOpen = choice.kind === "file" && choice.file.folder;
    const inserted = staysOpen || /^\s/.test(after) ? filled : `${filled} `;
    placeCursor.current = staysOpen
      ? word.start + filled.length - (filled.endsWith('"') ? 1 : 0)
      : word.start + filled.length + 1;
    setText(text.slice(0, word.start) + inserted + after);
    setCursor(placeCursor.current);
    box.current?.focus();
  };
  /**
   * Takes an option of the list: a command that takes no arguments and is the whole message is
   * sent at once; everything else is filled in.
   */
  const take = (choice: Choice) => {
    const whole = word?.first === true && text.slice(word.end).trim() === "";
    if (choice.kind === "command" && whole && choice.command.argumentHint === "" && !busy) {
      send(`/${choice.command.name}`);
    } else fill(choice);
  };
  const move = (step: number) => {
    setChosen({ query: query ?? "", index: (active + step + matches.length) % matches.length });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE) return;
    if (listing) {
      const choice = matches[active];
      if (event.key === "Escape") {
        // The list closes, and the text stays; Esc does not also stop a reply.
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(wordKey);
        return;
      }
      if (choice && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (choice && event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        fill(choice);
        return;
      }
      if (choice && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        take(choice);
        return;
      }
      // With nothing to take, Enter sends only from the first word's slash list, as before
      // (ADR 0042): a later word or a file mention is half-written (ADR 0052).
      const sendsAsBefore = word.sign === "/" && word.first;
      if (event.key === "Enter" && !event.shiftKey && !sendsAsBefore) {
        event.preventDefault();
        return;
      }
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <div
      {...(ownArea ? { "data-area": "messagebox" } : {})}
      className={cn("shrink-0 px-6", hasFigures ? "pb-2" : "pb-4", className)}
    >
      <div
        data-message-frame
        className="relative mx-auto flex max-w-[45rem] flex-col rounded-xl border border-input bg-background shadow-xs"
      >
        {listing ? (
          <MessageBoxList
            id={listId}
            label={strings.label}
            none={strings.none}
            options={
              options?.map((choice) =>
                choice.kind === "command"
                  ? {
                      key: choice.command.name,
                      content: <SlashCommandRow command={choice.command} />,
                    }
                  : { key: choice.file.path, content: <FileRow file={choice.file} /> },
              ) ?? null
            }
            active={active}
            onTake={(index) => {
              const choice = matches[index];
              if (choice) take(choice);
            }}
            onHover={(index) => {
              setChosen({ query: query ?? "", index });
            }}
          />
        ) : null}
        <Textarea
          ref={box}
          data-message-box
          aria-label={t("sessions.messageBox.label")}
          placeholder={t(`agents.${agent}.placeholder`)}
          spellCheck
          rows={2}
          className="max-h-48 min-h-16 resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-base md:text-base dark:bg-transparent"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setCursor(event.target.selectionStart);
          }}
          onSelect={(event) => {
            setCursor(event.currentTarget.selectionStart);
          }}
          onCompositionStart={() => {
            setComposing({ word });
          }}
          onCompositionEnd={(event) => {
            setComposing(null);
            setCursor(event.currentTarget.selectionStart);
          }}
          onKeyDown={onKeyDown}
          {...(slash || files
            ? {
                "aria-autocomplete": "list" as const,
                "aria-controls": listing ? listId : undefined,
                "aria-activedescendant":
                  listing && matches.length > 0 ? optionId(listId, active) : undefined,
              }
            : {})}
        />
        {slash || files ? (
          <output className="sr-only">
            {!listing || options === null
              ? ""
              : matches.length === 0
                ? strings.none
                : strings.count(matches.length)}
          </output>
        ) : null}
        {/*
          The menus wrap among themselves, and Send keeps the end of their last row, so it never
          goes onto a row of its own (#127). Every row of menus is as tall as Send, so Send lines
          up with the last one.
        */}
        <div className="flex items-end gap-1 ps-2 pe-2 pb-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 *:my-0.5">
            {choices}
            {carriesUltrathink ? (
              ultrathink.on ? (
                // The switch put it there, so pressing it takes it away.
                <Button
                  variant="outline"
                  size="xs"
                  className="font-normal text-foreground"
                  aria-label={t("sessions.messageBox.ultrathinkOff")}
                  onClick={ultrathink.onTurnOff}
                >
                  <LightbulbIcon aria-hidden className="size-4" strokeWidth={1.5} />
                  {t("sessions.messageBox.ultrathink")}
                  <XIcon aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                </Button>
              ) : (
                <span className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-foreground">
                  <LightbulbIcon aria-hidden className="size-4" strokeWidth={1.5} />
                  {t("sessions.messageBox.ultrathink")}
                </span>
              )
            ) : null}
          </div>
          {busy ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              aria-label={t("sessions.messageBox.stop")}
              onClick={onStop}
            >
              <SquareIcon aria-hidden strokeWidth={1.5} />
              {t("sessions.messageBox.stopShort")}
            </Button>
          ) : (
            <Button
              size="icon-sm"
              // With nothing to send, Send waits quietly instead of looking like a dimmed block.
              className="shrink-0 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100"
              aria-label={t("sessions.messageBox.send")}
              disabled={!canSend}
              onClick={() => {
                send();
              }}
            >
              <ArrowUpIcon aria-hidden strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>
      {hasFigures ? (
        // The line keeps its height while the figures are on their way, so the box does not move.
        <div className="mx-auto flex min-h-6 max-w-[45rem] items-center justify-end pt-1">
          {figures}
        </div>
      ) : null}
    </div>
  );
}
