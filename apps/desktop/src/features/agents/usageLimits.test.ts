import type { UsageWindow } from "@/ipc/bindings";

import { levelOf, shownWindows } from "./usageLimits";

const now = new Date(Date.UTC(2026, 9, 9, 12, 0));

function window(overrides: Partial<UsageWindow> = {}): UsageWindow {
  return {
    kind: "fiveHour",
    percent: 42,
    resetsAt: "2026-10-09T15:10:00+00:00",
    status: "allowed",
    ...overrides,
  };
}

describe("the windows shown", () => {
  it("are the windows Claude Code reported", () => {
    const weekly = window({ kind: "weekly", percent: 18, resetsAt: "2026-10-13T09:00:00+00:00" });

    expect(shownWindows({ report: "reported", windows: [window(), weekly] }, now)).toEqual([
      window(),
      weekly,
    ]);
  });

  it("show 0% and no reset time once the reset time has passed", () => {
    const passed = window({ percent: 100, status: "rejected", resetsAt: "2026-10-09T11:59:00Z" });

    expect(shownWindows({ report: "reported", windows: [passed] }, now)).toEqual([
      window({ percent: 0, status: "allowed", resetsAt: null }),
    ]);
  });

  it("are none when nothing was reported", () => {
    expect(shownWindows({ report: "notForThisSignIn", windows: [] }, now)).toEqual([]);
    expect(shownWindows({ report: "unknown", windows: [window()] }, now)).toEqual([]);
  });
});

describe("how near a window is to its limit", () => {
  it("is normal below 80%", () => {
    expect(levelOf(window({ percent: 79 }))).toBe("normal");
  });

  it("is near from 80%, or when Claude Code warns", () => {
    expect(levelOf(window({ percent: 80 }))).toBe("near");
    expect(levelOf(window({ percent: 30, status: "warning" }))).toBe("near");
  });

  it("is reached at 100%, or when Claude Code refuses", () => {
    expect(levelOf(window({ percent: 100 }))).toBe("reached");
    expect(levelOf(window({ percent: 64, status: "rejected" }))).toBe("reached");
  });
});
