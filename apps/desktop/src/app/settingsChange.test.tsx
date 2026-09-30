import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import { z } from "zod";

import type { Settings } from "@/ipc/bindings";
import { settingsWith } from "@/test/settings";

import { App } from "./App";

import "@/styles/global.css";

/** Plan §11: applying a settings change takes less than this. */
const target = 50;
/**
 * How far past the target a slow, shared CI machine may go before the check fails: the same margin
 * the start-up check gives CI (docs/performance.md). The GitHub runner has taken up to 81 ms.
 */
const margin = 2.5;

/** Rust, answering a change the way the real service does: with the settings after it. */
function startRust() {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  let current: Settings = settingsWith();
  mockIPC(
    (command, payload) => {
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "list_projects") return [];
      if (command === "get_settings") return current;
      if (command === "get_system_preferences") return { textScalePercent: 100, locale: "en-US" };
      if (command === "change_setting") {
        const { change } = z
          .object({ change: z.object({ appearanceShowStatusBar: z.boolean() }) })
          .parse(payload);
        current = settingsWith({ appearance: { showStatusBar: change.appearanceShowStatusBar } });
        return current;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
}

const statusBarShown = () => document.querySelector("footer") !== null;

/** Clicks the switch and resolves with the time until the change is on the screen. */
function timeChange(toggle: HTMLElement): Promise<number> {
  const wasShown = statusBarShown();
  const started = performance.now();
  toggle.click();
  return new Promise((resolve) => {
    const look = () => {
      if (statusBarShown() === wasShown) requestAnimationFrame(look);
      else resolve(performance.now() - started);
    };
    look();
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Benchmark: applying a settings change", () => {
  it("shows the change on the screen within the plan's 50 ms", async ({ annotate }) => {
    startRust();
    render(<App history={createMemoryHistory({ initialEntries: ["/settings/appearance"] })} />);
    const toggle = await screen.findByRole("switch", { name: "Show status bar" });
    expect(statusBarShown()).toBe(true);

    const timings: number[] = [];
    for (let change = 0; change < 6; change += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each change is timed on its own
      timings.push(await timeChange(toggle));
      // oxlint-disable-next-line no-await-in-loop -- and settles before the next one
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const median = timings.toSorted((a, b) => a - b)[timings.length / 2] ?? Infinity;
    // The numbers are printed so a slow run can be compared with a fast one.
    await annotate(
      `settings changes: ${timings.map((time) => time.toFixed(1)).join(", ")} ms, median ${median.toFixed(1)} ms (target ${target} ms)`,
    );

    expect(median).toBeLessThan(target * margin);
  });
});
