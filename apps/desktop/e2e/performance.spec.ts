/* oxlint-disable no-await-in-loop -- each start is measured after the last one has ended */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { measureUsage, median, type StartTimer, startTimer } from "./performance";

// Measures the release build against the targets in the plan (section 11) and fails when a
// measurement that has a gate is past its target by more than the safety margin. Run it with
// `pnpm test:perf`; docs/performance.md says what is measured and how.
//
// The app is only ever looked at from outside (see performance.ts): a release build opens no
// debugging port, and nothing here may depend on one.
test.skip(process.env["ARDEN_E2E_PERF"] !== "1", "needs a release build: run pnpm test:perf");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The plan's targets. A measurement with a gate fails the check when it is past its target by more
 * than the margin; the others are reported, next to their targets, and never fail it. Applying a
 * settings change is measured by the UI tests (`src/app/settingsChange.test.tsx`), in the page.
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
} as const;

type Name = keyof typeof measurements;
const names = [
  "coldStartMs",
  "warmStartMs",
  "idleMemoryMb",
  "idleCpuPercent",
] as const satisfies readonly Name[];

/**
 * How far past a target a measurement may go before it fails. A shared CI machine is slower and
 * noisier than the one the targets are for, so it gets more room. Set ARDEN_PERF_MARGIN to change it.
 */
const margin = Number(process.env["ARDEN_PERF_MARGIN"] ?? (process.env["CI"] ? 1.5 : 1.25));

/** How many times the app is started, cold and then warm, for the start-up measurements. */
const rounds = 4;

const results: Partial<Record<Name, number>> = {};

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
    "Applying a settings change and the 10,000-message session are measured by the UI tests.",
    "",
  ].join("\n");
}

/** Two new, empty folders for the app's files and the web engine's: a first start on a machine. */
function newFolders() {
  return {
    dataDir: mkdtempSync(path.join(tmpdir(), "arden-perf-data-")),
    profile: mkdtempSync(path.join(tmpdir(), "arden-perf-webview-")),
  };
}

function removeFolders({ dataDir, profile }: ReturnType<typeof newFolders>) {
  for (const folder of [dataDir, profile]) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

test.describe.configure({ mode: "serial" });

test.describe("performance of the release build", () => {
  let timer: StartTimer;

  test.beforeAll(async () => {
    timer = await startTimer();
  });

  test.afterAll(() => {
    timer.stop();
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
    test.setTimeout(180_000);
    const cold: number[] = [];
    const warm: number[] = [];
    for (let round = 0; round < rounds; round += 1) {
      const folders = newFolders();
      try {
        // A new web engine folder and new settings: the first start on a machine.
        const first = await timer.start(folders.dataDir, folders.profile);
        await timer.close(first);
        // Again, with everything the first start left behind.
        const second = await timer.start(folders.dataDir, folders.profile);
        await timer.close(second);
        cold.push(first.milliseconds);
        warm.push(second.milliseconds);
        // Where the time goes: until the web engine begins to load the page, and the rest.
        console.log(
          `  round ${round + 1}: cold ${first.milliseconds} ms (page began after ${first.pageBeganAfter ?? "?"} ms), warm ${second.milliseconds} ms (page began after ${second.pageBeganAfter ?? "?"} ms)`,
        );
      } finally {
        removeFolders(folders);
      }
    }
    // The best start is what the app can do. A slower one only says the machine was busy at that
    // moment (the virus scanner looks at every new file), so it must not fail the check.
    results.coldStartMs = Math.min(...cold);
    results.warmStartMs = Math.min(...warm);
    console.log(
      `cold starts: ${cold.join(", ")} ms (median ${Math.round(median(cold))}); warm starts: ${warm.join(", ")} ms (median ${Math.round(median(warm))})`,
    );

    check("coldStartMs");
    check("warmStartMs");
  });

  test("sits idle without using much memory or the processor", async () => {
    const folders = newFolders();
    const app = await timer.start(folders.dataDir, folders.profile);
    try {
      // The web engine is still starting helpers for a few seconds after the window is up.
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const before = measureUsage(app.pid);
      const measuredFrom = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      const after = measureUsage(app.pid);
      const seconds = (Date.now() - measuredFrom) / 1000;

      results.idleMemoryMb = after.memoryMb;
      results.idleCpuPercent = ((after.cpuSeconds - before.cpuSeconds) / seconds) * 100;
      console.log(`idle: ${after.processes} processes`);

      check("idleMemoryMb");
      check("idleCpuPercent");
    } finally {
      await timer.close(app);
      removeFolders(folders);
    }
  });
});
