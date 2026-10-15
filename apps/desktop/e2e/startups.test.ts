import { describe, expect, it } from "vitest";

import { summarizeStarts } from "./startups";

describe("Summarizing the start-up rounds", () => {
  it("gates the warm start on the page's share, which a slow web engine does not change", () => {
    // PR #168's run: the runner's web engine took 856 to 1,538 ms to begin loading the page.
    const summary = summarizeStarts([
      {
        cold: { milliseconds: 3496, pageBeganAfter: 3298 },
        warm: { milliseconds: 1433, pageBeganAfter: 997 },
      },
      {
        cold: { milliseconds: 2600, pageBeganAfter: 2081 },
        warm: { milliseconds: 1517, pageBeganAfter: 1078 },
      },
      {
        cold: { milliseconds: 3279, pageBeganAfter: 2948 },
        warm: { milliseconds: 1905, pageBeganAfter: 1538 },
      },
      {
        cold: { milliseconds: 2211, pageBeganAfter: 1671 },
        warm: { milliseconds: 1261, pageBeganAfter: 925 },
      },
    ]);

    expect(summary).toEqual({ coldStartMs: 2211, warmStartMs: 1261, warmStartPageMs: 336 });
  });

  it("takes the page's share from the starts that logged when the page began", () => {
    const summary = summarizeStarts([
      {
        cold: { milliseconds: 1800, pageBeganAfter: 1600 },
        warm: { milliseconds: 900, pageBeganAfter: undefined },
      },
      {
        cold: { milliseconds: 1900, pageBeganAfter: 1700 },
        warm: { milliseconds: 950, pageBeganAfter: 640 },
      },
    ]);

    expect(summary.warmStartPageMs).toBe(310);
  });

  it("puts the page's share past any limit when no start logged when the page began", () => {
    const summary = summarizeStarts([
      {
        cold: { milliseconds: 1800, pageBeganAfter: undefined },
        warm: { milliseconds: 900, pageBeganAfter: undefined },
      },
    ]);

    expect(summary.warmStartPageMs).toBe(Number.POSITIVE_INFINITY);
  });
});
