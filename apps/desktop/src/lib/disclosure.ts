import { useLayoutEffect, useRef } from "react";

/**
 * Opens or closes a disclosure without its move: marked still, the change is worked out once, so
 * the browser has drawn the new state when the move comes back and has nothing to animate. A plain
 * function: written in the hook, the read that draws the change was dropped as unused.
 */
function showAtOnce(details: HTMLDetailsElement, open: boolean) {
  details.dataset["disclosure"] = "still";
  details.open = open;
  void getComputedStyle(details, "::details-content").height;
  details.dataset["disclosure"] = "moving";
}

/**
 * Props for a `<details>` that moves as the person opens or closes it, and shows at once when code
 * opens or closes it with `open`, as a transcript view change does (ADR 0054).
 *
 * The browser animates `::details-content` only from a state it has already drawn, so the move is
 * on from the start (base.css), and a change made here is held still.
 */
export function useDisclosure(open = false) {
  const ref = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    if (ref.current) showAtOnce(ref.current, open);
  }, [open]);

  return { ref, "data-disclosure": "moving" } as const;
}
