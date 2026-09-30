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
    // The engine ignores that variable on some machines, so the app is told the port as well.
    ARDEN_CODE_DEBUG_PORT: String(debugPort),
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

/**
 * What the web engine was doing when the app did not open its debugging port: which processes of
 * this launch exist, the arguments they were given, and which ports they listen on.
 */
function describeWebView(profile: string): string {
  try {
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
        $elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        "running as an administrator: $elevated"
        $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe' OR Name = 'arden-code.exe'")
        foreach ($p in $processes) {
          $line = [string]$p.CommandLine
          if ($p.Name -eq 'arden-code.exe' -or $line -like '*${profile.replaceAll("'", "''")}*') {
            # The browser process holds the arguments that matter; the helpers only need a glimpse.
            $limit = if ($line -like '*--type=*') { 160 } else { 2000 }
            "$($p.ProcessId) $($p.Name) $($line.Substring(0, [Math]::Min($limit, $line.Length)))"
          }
        }
        "--- listening ports of those processes ---"
        $ids = $processes | ForEach-Object { $_.ProcessId }
        Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $ids -contains $_.OwningProcess } |
          ForEach-Object { "$($_.LocalAddress):$($_.LocalPort) pid $($_.OwningProcess)" }
        `,
      ],
      { encoding: "utf8", timeout: 20_000 },
    ).trim();
  } catch (error) {
    return `(could not look: ${error instanceof Error ? error.message : String(error)})`;
  }
}

/** Everything the app has written to its log files so far, as text. */
export function logText(dataDir: string): string {
  const folder = path.join(dataDir, "local", "logs");
  if (!existsSync(folder)) return "";
  return readdirSync(folder)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => readFileSync(path.join(folder, name), "utf8"))
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
  /** The folder the web engine keeps its files in for this launch. */
  webViewProfile: string;
  /** The port the web engine listens on for the Chrome DevTools Protocol. */
  debugPort: number;
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
  /** Arguments for the app, such as `--open <folder>`. */
  args?: string[];
}

/** Starts the app and attaches to its web page. */
export async function launchApp({
  dataDir,
  env = {},
  args = [],
}: LaunchOptions = {}): Promise<RunningApp> {
  const ownedFolders: string[] = [];
  const data = dataDir ?? mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
  if (!dataDir) ownedFolders.push(data);
  const profile = mkdtempSync(path.join(tmpdir(), "arden-e2e-webview-"));
  ownedFolders.push(profile);

  const debugPort = await freePort();
  const app = spawn(executable, args, {
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
      webViewProfile: profile,
      debugPort,
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
    const webView = describeWebView(profile);
    kill();
    cleanUp();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n--- the app's own log ---\n${tail}\n--- the web engine (port ${debugPort}) ---\n${webView}`,
      { cause: error },
    );
  }
}

/**
 * Opens one of the development pages, such as `/dev/errors`. A page that does not come up says
 * so within twenty seconds, with the end of the app's own log, and not only when the test's whole
 * time has gone.
 */
export async function openDevPage(app: RunningApp, route: string) {
  try {
    await app.page.goto(`http://tauri.localhost${route}`, {
      timeout: 20_000,
      waitUntil: "domcontentloaded",
    });
    await app.page.getByRole("main").waitFor({ timeout: 20_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}
--- the app's own log ---
${logTail(app.dataDir)}
--- the web engine ---
${describeWebView(app.webViewProfile)}`,
      { cause: error },
    );
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
