import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Page, chromium, test as base } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The debug build from `pnpm build:debug`. Set ARDEN_E2E_EXE to test another build. */
export const executable =
  process.env["ARDEN_E2E_EXE"] ?? path.join(repoRoot, "target", "debug", "arden-code.exe");

const debugPort = 9222;

/** Runs the app with all of its files in a folder of its own, so tests never touch real data. */
export function appEnvironment(dataDir: string, webViewProfile: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARDEN_CODE_DATA_DIR: dataDir,
    WEBVIEW2_USER_DATA_FOLDER: webViewProfile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
  };
}

/** What the app printed, so a failure can say why the app did not start. */
function collectOutput(app: ChildProcess): () => string {
  const chunks: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  return () => chunks.join("").trim();
}

/* oxlint-disable no-await-in-loop -- polling is sequential by nature */
async function waitForDebugEndpoint(app: ChildProcess, output: () => string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) {
      throw new Error(`Arden Code exited early with code ${app.exitCode}\n${output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // The web engine is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Arden Code did not open its debugging port within 30 seconds\n${output() || "(no output)"}`,
  );
}
/* oxlint-enable no-await-in-loop */

export interface RunningApp {
  process: ChildProcess;
  pid: number;
  /** The app's web page, attached over the Chrome DevTools Protocol. */
  page: Page;
  /** Closes the window the way the user would, and waits for the app to save and exit. */
  close(): Promise<void>;
  /** Ends the app and everything it started. Safe to call after `close`. */
  kill(): void;
}

export interface LaunchOptions {
  /** The folder for the app's files. Defaults to a new empty one. */
  dataDir?: string;
}

/** Starts the app and attaches to its web page. */
export async function launchApp({ dataDir }: LaunchOptions = {}): Promise<RunningApp> {
  const ownedFolders: string[] = [];
  const data = dataDir ?? mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
  if (!dataDir) ownedFolders.push(data);
  const profile = mkdtempSync(path.join(tmpdir(), "arden-e2e-webview-"));
  ownedFolders.push(profile);

  const app = spawn(executable, [], {
    env: appEnvironment(data, profile),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(app);
  const pid = app.pid;
  if (pid === undefined) throw new Error("Arden Code did not start");

  const kill = () => {
    try {
      // The app's web engine runs as child processes; end the whole tree.
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  };
  const cleanUp = () => {
    // Cleaning up temporary folders is best effort. It must never hide a test's own error, and the
    // web engine can hold files for a moment after it is told to stop.
    for (const folder of ownedFolders) {
      try {
        rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // The system's temporary folder is cleaned up eventually.
      }
    }
  };

  try {
    await waitForDebugEndpoint(app, output);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const page = browser.contexts()[0]?.pages()[0];
    if (!page) throw new Error("the app has no page to attach to");
    await page.waitForLoadState("load");

    return {
      process: app,
      pid,
      page,
      async close() {
        // Imported lazily to keep this file free of PowerShell until a test needs it.
        const { closeMainWindow } = await import("./windows");
        closeMainWindow(pid);
        await new Promise<void>((resolve) => {
          if (app.exitCode !== null) resolve();
          else app.once("exit", () => resolve());
          setTimeout(resolve, 10_000);
        });
        await browser.close().catch(() => {});
        kill();
        cleanUp();
      },
      kill() {
        kill();
        cleanUp();
      },
    };
  } catch (error) {
    kill();
    cleanUp();
    throw error;
  }
}

export const test = base.extend<{ appPage: Page }>({
  // Playwright requires fixtures to destructure their first argument, even when empty.
  // oxlint-disable-next-line no-empty-pattern
  appPage: async ({}, provide) => {
    const app = await launchApp();
    try {
      await provide(app.page);
    } finally {
      app.kill();
    }
  },
});

export { expect } from "@playwright/test";
