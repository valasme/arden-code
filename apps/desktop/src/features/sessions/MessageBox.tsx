import { ArrowUpIcon, LightbulbIcon, SquareIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentKind, SlashCommand } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

import { SlashCommandList, slashOptionId } from "./SlashCommandList";
import { filterSlashCommands, menuQuery } from "./slashCommands";
import { holdsUltrathink } from "./ultrathink";

/** The key code some browsers report for a key that is part of an input method's composition. */
const COMPOSING_KEY_CODE = 229;

interface MessageBoxProps {
  /** Whether a reply is running: then the button stops it instead of sending. */
  busy: boolean;
  /** The agent the message goes to: the placeholder names it. */
  agent: AgentKind;
  /**
   * What the next message can change: the agent and project menus while the session is empty
   * (ADR 0039), then the agent's own menus, such as the model (ADR 0044).
   */
  choices: ReactNode;
  /** The figures before Send, such as the usage limits (ADR 0044). None for an agent without. */
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
   * The Ultrathink switch of an agent that has it (ADR 0042): whether it is on, and how to turn it
   * off from the chip that says the next message will carry the word (ADR 0044).
   */
  ultrathink?: { on: boolean; onTurnOff: () => void };
  className?: string;
}

/**
 * Where the person writes (ADR 0032): a block at least two lines tall, with a lower line that
 * holds what the next message can change, then the figures and Send, or Stop while a reply runs
 * (ADR 0044). The line wraps when the box is narrow, and the figures stay with Send. Enter sends
 * and Shift+Enter adds a line. Enter never sends while a character is still being composed (an
 * accent key, an input method for another script): that Enter confirms the character.
 *
 * A message that starts with a slash lists the agent's slash commands above the box (ADR 0042).
 * The arrow keys move through the list, Tab fills in the command, and Enter sends one that takes
 * no arguments and fills in one that does. Esc closes the list and keeps the text.
 */
export function MessageBox({
  agent,
  busy,
  choices,
  figures,
  onSend,
  onStop,
  ownArea = true,
  slash,
  ultrathink,
  className,
}: MessageBoxProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  // A session opens ready to be written in.
  useEffect(() => {
    box.current?.focus();
  }, []);
  const canSend = !busy && text.trim() !== "";
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

  // The list of slash commands, while a message starts with a slash and has no space yet.
  const listId = useId();
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [chosen, setChosen] = useState({ query: "", index: 0 });
  const query = slash ? menuQuery(text) : null;
  const matches =
    slash && query !== null
      ? filterSlashCommands(slash.commands, slash.terminalCommands, query)
      : [];
  const listing = query !== null && dismissedAt !== text;
  const active = chosen.query === query ? Math.min(chosen.index, matches.length - 1) : 0;
  const fill = (command: SlashCommand) => {
    setText(`/${command.name} `);
    box.current?.focus();
  };
  /** Takes a command of the list: sent at once when it takes no arguments, else filled in. */
  const take = (command: SlashCommand) => {
    if (command.argumentHint === "" && !busy) send(`/${command.name}`);
    else fill(command);
  };
  const move = (step: number) => {
    setChosen({ query: query ?? "", index: (active + step + matches.length) % matches.length });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE) return;
    if (listing) {
      const command = matches[active];
      if (event.key === "Escape") {
        // The list closes, and the text stays; Esc does not also stop a reply.
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(text);
        return;
      }
      if (command && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (command && event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        fill(command);
        return;
      }
      if (command && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        take(command);
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
      className={cn("shrink-0 px-6 pb-4", className)}
    >
      <div
        data-message-frame
        className="relative mx-auto flex max-w-[45rem] flex-col border border-input bg-background"
      >
        {listing ? (
          <SlashCommandList
            id={listId}
            matches={matches}
            active={active}
            onTake={take}
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
          }}
          onKeyDown={onKeyDown}
          {...(slash
            ? {
                "aria-autocomplete": "list" as const,
                "aria-controls": listing ? listId : undefined,
                "aria-activedescendant":
                  listing && matches.length > 0 ? slashOptionId(listId, active) : undefined,
              }
            : {})}
        />
        {slash ? (
          <output className="sr-only">
            {listing
              ? matches.length === 0
                ? t("sessions.slash.none")
                : t("sessions.slash.count", { count: matches.length })
              : ""}
          </output>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 ps-3 pe-2 pb-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                <span className="flex h-6 items-center gap-1 border border-border px-2 text-foreground">
                  <LightbulbIcon aria-hidden className="size-4" strokeWidth={1.5} />
                  {t("sessions.messageBox.ultrathink")}
                </span>
              )
            ) : null}
          </span>
          <span className="ms-auto flex min-w-0 items-center gap-1">
            {figures}
            {busy ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={t("sessions.messageBox.stop")}
                onClick={onStop}
              >
                <SquareIcon aria-hidden strokeWidth={1.5} />
                {t("sessions.messageBox.stopShort")}
              </Button>
            ) : (
              <Button
                size="icon-sm"
                aria-label={t("sessions.messageBox.send")}
                disabled={!canSend}
                onClick={() => {
                  send();
                }}
              >
                <ArrowUpIcon aria-hidden strokeWidth={1.5} />
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
