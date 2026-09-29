import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { appEnvironment, executable, expect, launchApp, test } from "./fixtures";
import {
  countAppProcesses,
  getWindow,
  moveWindow,
  showWindow,
  virtualScreen,
  type WindowInfo,
} from "./windows";

/** Waits until the window is shown, and returns where it is. */
async function shownWindow(pid: number): Promise<WindowInfo> {
  await expect.poll(() => getWindow(pid), { timeout: 15_000 }).toBeDefined();
  const window = getWindow(pid);
  if (!window) throw new Error("the window disappeared");
  return window;
}

function newDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), "arden-e2e-window-"));
}

const stateFile = (dataDir: string) => path.join(dataDir, "config", "window-state.json");

test.describe("window memory", () => {
  test("reopens where it was, at the same size", async () => {
    const dataDir = newDataDir();
    try {
      const first = await launchApp({ dataDir });
      const pid = first.pid;
      await shownWindow(pid);
      moveWindow(pid, { x: 120, y: 90, width: 1000, height: 700 });
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        const reopened = await shownWindow(second.pid);
        expect(reopened).toMatchObject({ x: 120, y: 90, width: 1000, height: 700 });
      } finally {
        second.kill();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("moves a window back on screen when it was saved somewhere that no longer exists", async () => {
    const dataDir = newDataDir();
    try {
      mkdirSync(path.dirname(stateFile(dataDir)), { recursive: true });
      writeFileSync(
        stateFile(dataDir),
        JSON.stringify({
          x: 40_000,
          y: 40_000,
          width: 1000,
          height: 700,
          scale_factor: 1,
          maximized: false,
        }),
      );

      const app = await launchApp({ dataDir });
      try {
        const window = await shownWindow(app.pid);
        const screen = virtualScreen();

        expect(window.x).toBeGreaterThanOrEqual(screen.x);
        expect(window.y).toBeGreaterThanOrEqual(screen.y);
        expect(window.x + window.width).toBeLessThanOrEqual(screen.x + screen.width);
        expect(window.y + window.height).toBeLessThanOrEqual(screen.y + screen.height);
      } finally {
        app.kill();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("starts fresh when the saved state is damaged", async () => {
    const dataDir = newDataDir();
    try {
      mkdirSync(path.dirname(stateFile(dataDir)), { recursive: true });
      writeFileSync(stateFile(dataDir), "{ not json");

      const app = await launchApp({ dataDir });
      try {
        expect((await shownWindow(app.pid)).width).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
      // The next save replaces the damaged file with a good one.
      expect(JSON.parse(readFileSync(stateFile(dataDir), "utf8"))).toHaveProperty("width");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("remembers that the window was maximized", async () => {
    const dataDir = newDataDir();
    try {
      const first = await launchApp({ dataDir });
      await shownWindow(first.pid);
      showWindow(first.pid, "maximize");
      await expect.poll(() => getWindow(first.pid)?.maximized).toBe(true);
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        await shownWindow(second.pid);
        await expect.poll(() => getWindow(second.pid)?.maximized).toBe(true);
      } finally {
        second.kill();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

test("launching the app again brings the running window forward instead of opening a second one", async () => {
  const dataDir = newDataDir();
  const first = await launchApp({ dataDir });
  try {
    await shownWindow(first.pid);
    showWindow(first.pid, "minimize");
    await expect.poll(() => getWindow(first.pid)?.minimized).toBe(true);

    const profile = mkdtempSync(path.join(tmpdir(), "arden-e2e-second-"));
    const second = spawn(executable, [], {
      env: appEnvironment(dataDir, profile),
      stdio: "ignore",
    });
    const exitCode = await new Promise<number | null>((resolve) => {
      second.once("exit", (code) => resolve(code));
      setTimeout(() => resolve(null), 15_000);
    });

    expect(exitCode, "the second launch should end by itself").toBe(0);
    await expect.poll(() => getWindow(first.pid)?.minimized).toBe(false);
    expect(countAppProcesses()).toBe(1);
    rmSync(profile, { recursive: true, force: true });
  } finally {
    first.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
