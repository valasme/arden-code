import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Page, chromium, test as base } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The debug build from `pnpm build:debug`. Set ARDEN_E2E_EXE to test another build. */
export const executable =
  process.env["ARDEN_E2E_EXE"] ?? path.join(repoRoot, "target", "debug", "arden-code.exe");

/** A port nothing is using, so each launch has its own debugging endpoint. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/** Runs the app with all of its files in a folder of its own, so tests never touch real data. */
export function appEnvironment(
  dataDir: string,
  webViewProfile: string,
  debugPort: number,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARDEN_CODE_DATA_DIR: dataDir,
    WEBVIEW2_USER_DATA_FOLDER: webViewProfile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
  };
}

/** The last lines of the app's own log files, to show what it was doing when a launch failed. */
function logTail(dataDir: string): string {
  const folder = path.join(dataDir, "local", "logs");
  if (!existsSync(folder)) return "(the app wrote no log)";
  const lines = readdirSync(folder).flatMap((name) =>
    readFileSync(path.join(folder, name), "utf8").split("\n"),
  );
  return lines
    .filter((line) => line.trim() !== "")
    .slice(-25)
    .join("\n");
}

/** What the app printed, so a failure can say why the app did not start. */
function collectOutput(app: ChildProcess): () => string {
  const chunks: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  return () => chunks.join("").trim();
}

/* oxlint-disable no-await-in-loop -- polling is sequential by nature */
async function waitForDebugEndpoint(app: ChildProcess, output: () => string, debugPort: number) {
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
  /** The folder holding all of the app's files: settings, logs and crash reports. */
  dataDir: string;
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
  /** More environment variables for the app, such as the file that stands in for Windows' settings. */
  env?: Record<string, string>;
}

/** Starts the app and attaches to its web page. */
export async function launchApp({ dataDir, env = {} }: LaunchOptions = {}): Promise<RunningApp> {
  const ownedFolders: string[] = [];
  const data = dataDir ?? mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
  if (!dataDir) ownedFolders.push(data);
  const profile = mkdtempSync(path.join(tmpdir(), "arden-e2e-webview-"));
  ownedFolders.push(profile);

  const debugPort = await freePort();
  const app = spawn(executable, [], {
    env: { ...appEnvironment(data, profile, debugPort), ...env },
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
    await waitForDebugEndpoint(app, output, debugPort);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const page = browser.contexts()[0]?.pages()[0];
    if (!page) throw new Error("the app has no page to attach to");
    // The page is attached while still blank; the app navigates to its own address a moment later.
    // Tests must not start before that, or their own navigation would race the app's.
    await page.waitForURL(/^https?:\/\/tauri\.localhost\//);
    await page.waitForLoadState("load");

    return {
      process: app,
      pid,
      dataDir: data,
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
    const tail = logTail(data);
    kill();
    cleanUp();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n--- the app's own log ---\n${tail}`, { cause: error });
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
