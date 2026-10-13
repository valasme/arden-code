/**
 * The pace of what Motion moves: what React adds, removes or moves, such as a sidebar row (ADR
 * 0054). The same as an overlay's, which tokens.css gives CSS; a test keeps the two the same. Every
 * Motion transition comes from here.
 */

/** Coming in, or moving to a new place: Fluent 2's decelerate-mid curve. */
export const opening = { duration: 0.16, ease: [0, 0, 0, 1] } as const;

/** Leaving: Fluent 2's accelerate-min curve. */
export const closing = { duration: 0.12, ease: [0.8, 0, 0.78, 1] } as const;

/**
 * A row of a list that fades in when it comes, slides to its new place when it moves, even into
 * another list with the same `layoutId`, and fades out when it leaves. Spread on an `m.li` inside
 * `AnimatePresence`.
 */
export const listRow = {
  layout: "position",
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: closing },
  transition: opening,
} as const;

/**
 * A section of rows under its label, which slides to its new place as its rows do and fades out
 * whole, its last rows with it, when it leaves. It comes at once, so a row moving into it, as into
 * Pinned, shows its own move. Spread on an `m.section` inside `AnimatePresence`.
 */
export const listSection = {
  layout: "position",
  exit: { opacity: 0, transition: closing },
  transition: opening,
} as const;
