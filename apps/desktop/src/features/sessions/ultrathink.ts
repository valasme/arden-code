import { useState } from "react";

/** The word that asks Claude Code for deeper reasoning on the turn it is in (ADR 0042). */
const WORD = "ultrathink";

/**
 * The message with the word at its end, so Claude Code reasons more deeply on this turn only. A
 * message that already holds the word, or is a slash command, is left as it is.
 */
export function withUltrathink(text: string): string {
  if (text.startsWith("/") || new RegExp(String.raw`\b${WORD}\b`, "i").test(text)) return text;
  return `${text} ${WORD}`;
}

/**
 * The Ultrathink switch of a message box: the next message carries the word, and the switch turns
 * itself off once that message is sent. A message that was not sent, such as one that asked to
 * trust a folder and was cancelled, leaves the switch as it was. `carrying` makes the function
 * that sends a message send it with the word when the switch is on.
 */
export function useUltrathink() {
  const [ultrathink, setUltrathink] = useState(false);

  const carrying =
    (send: (text: string) => boolean | Promise<boolean>) =>
    (text: string): boolean | Promise<boolean> => {
      const sent = send(ultrathink ? withUltrathink(text) : text);
      void Promise.resolve(sent).then((done) => {
        if (done) setUltrathink(false);
      });
      return sent;
    };

  return { ultrathink, setUltrathink, carrying };
}
