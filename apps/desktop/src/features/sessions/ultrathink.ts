import { useDraftsStore } from "@/state/drafts";

/** The word that asks Claude Code for deeper reasoning on the turn it is in (ADR 0042). */
const WORD = "ultrathink";

/**
 * Whether a message holds the word on its own, in any case, so Claude Code reasons more deeply on
 * its turn. A slash command never carries it (ADR 0042).
 */
export function holdsUltrathink(text: string): boolean {
  return !text.startsWith("/") && new RegExp(String.raw`\b${WORD}\b`, "i").test(text);
}

/**
 * The message with the word at its end, so Claude Code reasons more deeply on this turn only. A
 * message that already holds the word, or is a slash command, is left as it is.
 */
export function withUltrathink(text: string): string {
  if (text.startsWith("/") || holdsUltrathink(text)) return text;
  return `${text} ${WORD}`;
}

/**
 * The Ultrathink switch of a message box: the next message carries the word, and the switch turns
 * itself off once that message is sent. A message that was not sent, such as one that asked to
 * trust a folder and was cancelled, leaves the switch as it was. `carrying` makes the function
 * that sends a message send it with the word when the switch is on. The switch belongs to the
 * draft of a message box, the session's or the welcome state's, and stays with it (ADR 0046).
 */
export function useUltrathink(draft: string) {
  const ultrathink = useDraftsStore((state) => state.ultrathink[draft] ?? false);
  const setSwitch = useDraftsStore((state) => state.setUltrathink);
  const setUltrathink = (on: boolean) => {
    setSwitch(draft, on);
  };

  const carrying =
    (send: (text: string) => boolean | Promise<boolean>) =>
    (text: string): boolean | Promise<boolean> => {
      const sent = send(ultrathink ? withUltrathink(text) : text);
      void Promise.resolve(sent).then((done) => {
        // A slash command takes no word, so it leaves the switch for the next message.
        if (done && !text.startsWith("/")) setUltrathink(false);
      });
      return sent;
    };

  return { ultrathink, setUltrathink, carrying };
}
