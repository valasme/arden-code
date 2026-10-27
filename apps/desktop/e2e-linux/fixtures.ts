import { type ChildProcess, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Session } from "./webdriver";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The debug build from `pnpm build:debug`. Set ARDEN_E2E_EXE to test another build. */
export const executable =
  process.env["ARDEN_E2E_EXE"] ?? path.join(repoRoot, "target", "debug", "arden-code");

/** The workspace's stand-in for Claude Code (ADR 0038), built with the app. */
const standIn =
  process.env["ARDEN_E2E_CLAUDE"] ?? path.join(repoRoot, "target", "debug", "claude-stand-in");

/** Tauri's WebDriver server, which starts the app through WebKitGTK's own (`WebKitWebDriver`). */
const tauriDriver =
  process.env["ARDEN_E2E_TAURI_DRIVER"] ?? path.join(homedir(), ".cargo", "bin", "tauri-driver");

/** A port nothing is using. */
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

/**
 * This process's `PATH` without the folders that hold the person's own Claude Code or Codex, so the
 * app under test never finds them.
 */
function pathWithoutAgents(): string {
  return (process.env["PATH"] ?? "")
    .split(path.delimiter)
    .filter((folder) => !["claude", "codex"].some((name) => existsSync(path.join(folder, name))))
    .join(path.delimiter);
}

/** A folder that holds the stand-in as `claude`, with its settings beside it. */
export function claudeOnPath(settings: Record<string, unknown> = {}) {
  const bin = mkdtempSync(path.join(tmpdir(), "arden-e2e-claude-"));
  copyFileSync(standIn, path.join(bin, "claude"));
  writeFileSync(path.join(bin, "stand-in.json"), JSON.stringify(settings));
  return {
    bin,
    path: `${bin}${path.delimiter}${pathWithoutAgents()}`,
    remove: () => {
      rmSync(bin, { recursive: true, force: true });
    },
  };
}

/** The ids of the processes whose program is `program`, read from `/proc`. */
export function processesOf(program: string): number[] {
  return readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .filter((id) => {
      try {
        return readFileSync(`/proc/${id}/cmdline`, "utf8").split("\0")[0] === program;
      } catch {
        return false;
      }
    })
    .map(Number);
}

/** Whether a process runs: it exists and has not ended (a zombie waits to be collected). */
export function runs(id: number): boolean {
  try {
    const stat = readFileSync(`/proc/${id}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

/** The id of the process that started `id`. */
export function parentOf(id: number): number {
  const stat = readFileSync(`/proc/${id}/stat`, "utf8");
  return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
}

/**
 * The processes of the app started with `dataDir` as its folder. Only one copy of the app runs in a
 * desktop session: a copy that is still ending would take the next test's start for a second launch.
 */
function appProcesses(dataDir: string): number[] {
  return processesOf(executable).filter((id) => {
    try {
      return readFileSync(`/proc/${id}/environ`, "utf8")
        .split("\0")
        .includes(`ARDEN_CODE_DATA_DIR=${dataDir}`);
    } catch {
      return false;
    }
  });
}

/** Waits for the app started with `dataDir` to end, and kills what is left after a few seconds. */
async function waitForAppToEnd(dataDir: string) {
  try {
    await until(() => appProcesses(dataDir).every((id) => !runs(id)), "the app to end", 10_000);
  } catch {
    for (const id of appProcesses(dataDir)) process.kill(id, "SIGKILL");
    await until(() => appProcesses(dataDir).every((id) => !runs(id)), "the app to be killed");
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

/* oxlint-disable no-await-in-loop -- polling is sequential by nature */
/** Calls `check` until it holds, for at most `timeout` milliseconds. */
export async function until(
  check: () => boolean | Promise<boolean>,
  what: string,
  timeout = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function waitForDriver(url: string, driver: ChildProcess, output: () => string) {
  await until(async () => {
    if (driver.exitCode !== null) {
      throw new Error(`tauri-driver exited with code ${driver.exitCode}\n${output()}`);
    }
    try {
      return (await fetch(`${url}/status`)).ok;
    } catch {
      return false;
    }
  }, "tauri-driver to listen");
}
/* oxlint-enable no-await-in-loop */

export interface RunningApp {
  session: Session;
  /** The environment the app was started with, for a second start that should reach it. */
  env: NodeJS.ProcessEnv;
  /** The folder holding all of the app's files. */
  dataDir: string;
  /** Ends the session, which closes the app, and the driver. */
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** The folder for the app's files. Defaults to a new empty one. */
  dataDir?: string;
  /** The `PATH` the app is started with. Defaults to one with no agent CLI on it. */
  path?: string;
  /** More environment variables for the app. */
  env?: Record<string, string>;
}

/** Starts the app through tauri-driver, with all of its files in a folder of its own. */
export async function launchApp({
  dataDir,
  path: searchPath = pathWithoutAgents(),
  env = {},
}: LaunchOptions = {}): Promise<RunningApp> {
  const data = dataDir ?? mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
  const [port, nativePort] = [await freePort(), await freePort()];
  const appEnv = { ...process.env, ...env, ARDEN_CODE_DATA_DIR: data, PATH: searchPath };
  const driver = spawn(tauriDriver, ["--port", String(port), "--native-port", String(nativePort)], {
    env: appEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: string[] = [];
  driver.stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  driver.stderr.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const output = () => chunks.join("").trim();
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForDriver(url, driver, output);
    const session = await Session.start(url, {
      "tauri:options": { application: executable },
    });
    return {
      session,
      env: appEnv,
      dataDir: data,
      close: async () => {
        try {
          await session.end();
        } finally {
          await waitForAppToEnd(data);
          driver.kill();
          if (!dataDir) rmSync(data, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    driver.kill();
    throw new Error(
      `${String(error)}\n--- tauri-driver ---\n${output()}\n--- app log ---\n${logText(data)}`,
      {
        cause: error,
      },
    );
  }
}
