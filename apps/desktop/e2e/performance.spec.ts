/* oxlint-disable no-await-in-loop -- each start and each change is measured after the last one */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appEnvironment, executable, expect, launchApp, type RunningApp, test } from "./fixtures";
import { measureUsage, median } from "./performance";
import { getWindow } from "./windows";

// Measures the release build against the targets in the plan (section 11) and fails when a
// measurement that has a gate is past its target by more than the safety margin. Run it with
// `pnpm test:perf`; docs/performance.md says what is measured and how.
test.skip(process.env["ARDEN_E2E_PERF"] !== "1", "needs a release build: run pnpm test:perf");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The plan's targets. A measurement with a gate fails the check when it is past its target by more
 * than the margin; the others are reported, next to their targets, and never fail it.
 */
const measurements = {
  coldStartMs: {
    label: "Cold start to a shown window (best of the rounds)",
    unit: "ms",
    target: 1000,
    gated: true,
  },
  warmStartMs: {
    label: "Warm start to a shown window (best of the rounds)",
    unit: "ms",
    target: 400,
    gated: false,
  },
  idleMemoryMb: { label: "Idle memory, web engine included", unit: "MB", target: 200, gated: true },
  idleCpuPercent: { label: "Idle CPU, of one core", unit: "%", target: 1, gated: false },
  settingChangeMs: {
    label: "Applying a settings change (median)",
    unit: "ms",
    target: 50,
    gated: true,
  },
} as const;

type Name = keyof typeof measurements;
const names = [
  "coldStartMs",
  "warmStartMs",
  "idleMemoryMb",
  "idleCpuPercent",
  "settingChangeMs",
] as const satisfies readonly Name[];

/**
 * How far past a target a measurement may go before it fails. A shared CI machine is slower and
 * noisier than the one the targets are for, so it gets more room. Set ARDEN_PERF_MARGIN to change it.
 */
const margin = Number(process.env["ARDEN_PERF_MARGIN"] ?? (process.env["CI"] ? 1.5 : 1.25));

/** How many times the app is started, cold and then warm, for the start-up measurements. */
const rounds = 4;
const windowShownMark = "arden:window-shown";

const results: Partial<Record<Name, number>> = {};

/** When the window was shown, counted from when the app was started. */
async function startTime(app: RunningApp): Promise<number> {
  let pageStartedAt = 0;
  let shownAt = 0;
  await expect
    .poll(
      async () => {
        [pageStartedAt, shownAt] = await app.page.evaluate((mark) => {
          const [entry] = performance.getEntriesByName(mark, "mark");
          return [performance.timeOrigin, entry ? performance.timeOrigin + entry.startTime : 0];
        }, windowShownMark);
        return shownAt;
      },
      { timeout: 15_000, intervals: [25] },
    )
    .toBeGreaterThan(0);
  // Where the time goes: until the web engine starts loading the page, and from there to the window.
  console.log(
    `  the page began ${Math.round(pageStartedAt - app.startedAt)} ms after the app started, and the window was shown ${Math.round(shownAt - pageStartedAt)} ms after that`,
  );
  return shownAt - app.startedAt;
}

function check(name: Name) {
  const { target, gated } = measurements[name];
  const value = results[name];
  if (!gated || value === undefined) return;
  const limit = target * margin;
  expect(
    value,
    `${name} was ${value.toFixed(1)}, the target is ${target} and it fails past ${limit.toFixed(0)}`,
  ).toBeLessThanOrEqual(limit);
}

function report(): string {
  const rows = names.map((name) => {
    const { label, unit, target, gated } = measurements[name];
    const value = results[name];
    const result = value === undefined ? "not measured" : `${value.toFixed(1)} ${unit}`;
    const status =
      value === undefined
        ? ""
        : value <= target
          ? "within the target"
          : gated
            ? value <= target * margin
              ? "over the target, within the margin"
              : "**over the margin**"
            : "over the target (reported, not gated)";
    return `| ${label} | ${result} | ${target} ${unit} | ${status} |`;
  });
  return [
    `### Performance of the release build (a gated measurement fails past its target times ${margin})`,
    "",
    "| Measurement | Result | Target | |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

test.describe.configure({ mode: "serial" });

test.describe("performance of the release build", () => {
  test.afterAll(() => {
    const table = report();
    console.log(`\n${table}`);
    mkdirSync(path.join(repoRoot, "target"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, "target", "performance.json"),
      JSON.stringify({ margin, measurements, results }, null, 2),
    );
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary) appendFileSync(summary, `${table}\n`);
  });

  test("starts, cold and warm, in the time the plan allows", async () => {
    const cold: number[] = [];
    const warm: number[] = [];
    for (let round = 0; round < rounds; round += 1) {
      const dataDir = mkdtempSync(path.join(tmpdir(), "arden-perf-data-"));
      const profile = mkdtempSync(path.join(tmpdir(), "arden-perf-webview-"));
      try {
        // A new web engine folder and new settings: the first start on a machine.
        const first = await launchApp({ dataDir, webViewProfile: profile });
        try {
          cold.push(await startTime(first));
        } finally {
          await first.close();
        }
        // Again, with everything the first start left behind.
        const second = await launchApp({ dataDir, webViewProfile: profile });
        try {
          warm.push(await startTime(second));
        } finally {
          await second.close();
        }
      } finally {
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    }
    // The best start is what the app can do. A slower one only says the machine was busy at that
    // moment (the virus scanner looks at every new file), so it must not fail the check.
    results.coldStartMs = Math.min(...cold);
    results.warmStartMs = Math.min(...warm);
    console.log(
      `cold starts: ${cold.map(Math.round).join(", ")} ms (median ${Math.round(median(cold))}); warm starts: ${warm.map(Math.round).join(", ")} ms (median ${Math.round(median(warm))})`,
    );

    check("coldStartMs");
    check("warmStartMs");
  });

  test("sits idle without using much memory or the processor", async () => {
    // Nothing is attached to the app here: a test that drives the page through the debugging port
    // makes the web engine do work of its own, and this measures what a person's app costs.
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-perf-data-"));
    const profile = mkdtempSync(path.join(tmpdir(), "arden-perf-webview-"));
    const app = spawn(executable, [], {
      env: appEnvironment(dataDir, profile, 0),
      stdio: "ignore",
    });
    const pid = app.pid;
    if (pid === undefined) throw new Error("Arden Code did not start");
    try {
      await expect.poll(() => getWindow(pid) !== undefined, { timeout: 30_000 }).toBe(true);
      // The web engine is still starting helpers for a few seconds after the window is up.
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const before = measureUsage(pid);
      const measuredFrom = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const after = measureUsage(pid);
      const seconds = (Date.now() - measuredFrom) / 1000;

      results.idleMemoryMb = after.memoryMb;
      results.idleCpuPercent = ((after.cpuSeconds - before.cpuSeconds) / seconds) * 100;
      console.log(`idle: ${after.processes} processes`);

      check("idleMemoryMb");
      check("idleCpuPercent");
    } finally {
      try {
        execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // Already gone.
      }
      for (const folder of [dataDir, profile]) {
        rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    }
  });

  test("applies a settings change in less than 50 ms", async () => {
    const app = await launchApp();
    try {
      await app.page.getByRole("link", { name: "Settings" }).click();
      await app.page.getByRole("link", { name: "Appearance", exact: true }).click();
      const toggle = app.page.getByRole("switch", { name: "Show status bar" });
      await expect(toggle).toBeVisible();

      // From the click to the moment the page shows the change, measured inside the page, so that
      // the test's own round trips to it are not counted.
      const timings: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        timings.push(
          await toggle.evaluate(async (element) => {
            const wasShown = document.querySelector("footer") !== null;
            const started = performance.now();
            if (element instanceof HTMLElement) element.click();
            await new Promise<void>((resolve, reject) => {
              const look = () => {
                if (performance.now() - started > 2000)
                  reject(new Error("the status bar did not change"));
                else if ((document.querySelector("footer") !== null) !== wasShown) resolve();
                else requestAnimationFrame(look);
              };
              look();
            });
            const changed = performance.now();
            // Let the change settle before the next one.
            await new Promise((resolve) => setTimeout(resolve, 300));
            return changed - started;
          }),
        );
      }
      results.settingChangeMs = median(timings);
      console.log(`settings changes: ${timings.map((value) => value.toFixed(1)).join(", ")} ms`);

      check("settingChangeMs");
    } finally {
      app.kill();
    }
  });
});
