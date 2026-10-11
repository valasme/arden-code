import { useEffect, useState } from "react";

/** Each frame shows this share of what is still to show, and one character more. */
const SHARE_PER_FRAME = 4;

/** Whether a UTF-16 code unit starts a pair that a character is written with, such as an emoji. */
const startsPair = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;

/**
 * How much of a growing text to show (#132). An agent's reply arrives in pieces, a few words every
 * 25 ms or so; shown as they come, the words pop in in bursts. Instead, what has arrived is shown a
 * few characters on every frame (a quarter of what is still to show, and one more), so the text
 * flows: at Claude's pace it runs about three frames behind, and a burst of 50 characters is caught
 * up in eight frames (130 ms). Text that is already there when it is first
 * drawn, as when a session opens, is shown at once.
 *
 * It is not an animation: the text itself is drawn a little at a time, so it flows the same with
 * reduced motion.
 */
export function useSteadyText(text: string): string {
  const [shown, setShown] = useState(text.length);
  const arrived = text.length;

  useEffect(() => {
    if (shown >= arrived) return undefined;
    const frame = requestAnimationFrame(() => {
      setShown((now) => Math.min(arrived, now + Math.ceil((arrived - now) / SHARE_PER_FRAME) + 1));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [shown, arrived]);

  let end = Math.min(shown, arrived);
  // A character written as a pair of code units is never cut in half.
  if (end < arrived && startsPair(text.charCodeAt(end - 1))) end += 1;
  return text.slice(0, end);
}
