/** One start of the app: how long until its window showed, and until the page began to load. */
export interface StartTime {
  milliseconds: number;
  pageBeganAfter: number | undefined;
}

/** A round of the start-up check: a first start on new folders, then one on what it left. */
export interface StartRound {
  cold: StartTime;
  warm: StartTime;
}

/**
 * What the start-up check measures from its rounds (docs/performance.md). The best start is what
 * the app can do. The warm start's page share, from the page beginning to load to the window being
 * shown, is the part the app controls: the web engine's own start comes before it, and on a slow CI
 * runner that alone can take longer than the whole of a warm start's margin (ADR 0055).
 */
export function summarizeStarts(rounds: StartRound[]) {
  const warm = rounds.map((round) => round.warm);
  const pageShares = warm.map(({ milliseconds, pageBeganAfter }) =>
    pageBeganAfter === undefined ? Number.POSITIVE_INFINITY : milliseconds - pageBeganAfter,
  );
  return {
    coldStartMs: Math.min(...rounds.map((round) => round.cold.milliseconds)),
    warmStartMs: Math.min(...warm.map(({ milliseconds }) => milliseconds)),
    warmStartPageMs: Math.min(...pageShares),
  };
}
