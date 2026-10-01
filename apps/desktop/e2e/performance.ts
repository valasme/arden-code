import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { z } from "zod";

import { executable } from "./fixtures";
import { closeMainWindow } from "./windows";

// Everything here looks at the app from outside. A release build opens no debugging port (only a
// debug build does, see `create_main_window`), so the performance check never attaches to it: it
// measures the app as it is shipped.

/** What the app costs while it sits idle: the app and every process its web engine started. */
const usageSchema = z.object({
  /** Private working set, the number Task Manager shows as Memory, in megabytes. */
  memoryMb: z.number(),
  /** Processor time used since the processes started, in seconds. */
  cpuSeconds: z.number(),
  processes: z.number(),
});

export type Usage = z.infer<typeof usageSchema>;

/** The app's process and all of its descendants, which is where the web engine's processes are. */
export function measureUsage(pid: number): Usage {
  const output = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
      $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
      $ids = New-Object System.Collections.Generic.HashSet[uint32]
      [void]$ids.Add(${pid})
      do {
        $before = $ids.Count
        foreach ($p in $all) { if ($ids.Contains([uint32]$p.ParentProcessId)) { [void]$ids.Add([uint32]$p.ProcessId) } }
      } while ($ids.Count -ne $before)
      $memory = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
        Where-Object { $ids.Contains([uint32]$_.IDProcess) } |
        Measure-Object -Property WorkingSetPrivate -Sum).Sum
      $cpu = 0.0
      foreach ($id in $ids) {
        $process = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($process) { $cpu += $process.TotalProcessorTime.TotalSeconds }
      }
      @{ memoryMb = $memory / 1MB; cpuSeconds = $cpu; processes = $ids.Count } | ConvertTo-Json -Compress
      `,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  return usageSchema.parse(JSON.parse(output));
}

/**
 * A helper that waits for a process's window to become visible and says when, in milliseconds since
 * 1970. It polls Windows every millisecond or so, so a start is timed to within a few milliseconds.
 * The helper is compiled once, before the first start, so compiling it is never timed.
 */
const watcherScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class ShownWindow {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint period);
  static bool Visible(uint pid, string title) {
    bool found = false;
    EnumWindows((h, l) => {
      uint owner; GetWindowThreadProcessId(h, out owner);
      if (owner == pid && IsWindowVisible(h)) {
        var text = new StringBuilder(256); GetWindowText(h, text, 256);
        if (text.ToString() == title) { found = true; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static long WaitUntilVisible(uint pid, string title, int timeoutMs) {
    var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
    while (DateTime.UtcNow < deadline) {
      if (Visible(pid, title)) return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      Thread.Sleep(1);
    }
    return 0;
  }
}
"@
[void][ShownWindow]::timeBeginPeriod(1)
[Console]::Out.WriteLine("ready")
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ([string]::IsNullOrEmpty($line)) { break }
  $shownAt = [ShownWindow]::WaitUntilVisible([uint32]$line, "Arden Code", 30000)
  [Console]::Out.WriteLine("$shownAt")
  [Console]::Out.Flush()
}
`;

export interface Start {
  pid: number;
  process: ChildProcess;
  /** From starting the process to its window being shown, in milliseconds. */
  milliseconds: number;
  /** From starting the process to the web engine beginning to load the page, from the app's log. */
  pageBeganAfter: number | undefined;
}

export interface StartTimer {
  /** Starts the app on these folders and resolves once its window is shown. */
  start(dataDir: string, webViewProfile: string): Promise<Start>;
  /** Closes the app the way a person would, and ends it if it does not go. */
  close(start: Start): Promise<void>;
  stop(): void;
}

/** The environment of a person's app: its own folders, and nothing that opens a debugging port. */
function plainEnvironment(dataDir: string, webViewProfile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ARDEN_CODE_DATA_DIR: dataDir,
    WEBVIEW2_USER_DATA_FOLDER: webViewProfile,
  };
  delete env["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"];
  delete env["ARDEN_CODE_DEBUG_PORT"];
  return env;
}

/** When the app's log says the web engine began loading the page, at or after `since`. */
function pageBeganAt(dataDir: string, since: number): number | undefined {
  const folder = path.join(dataDir, "local", "logs");
  if (!existsSync(folder)) return undefined;
  const times = readdirSync(folder)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => readFileSync(path.join(folder, name), "utf8").split("\n"))
    .filter((line) => line.includes('"page load"') && line.includes('"Started"'))
    .map((line) => {
      const { timestamp } = z.object({ timestamp: z.string() }).parse(JSON.parse(line));
      // The log keeps seven decimals of a second; a date in JavaScript takes three.
      return Date.parse(`${timestamp.slice(0, 23)}Z`);
    })
    .filter((time) => time >= since - 5);
  return times.length > 0 ? Math.min(...times) : undefined;
}

/** Starts a watcher that times how long the app takes to show its window. */
export async function startTimer(): Promise<StartTimer> {
  const watcher = spawn(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", watcherScript],
    {
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  const lines = createInterface({ input: watcher.stdout })[Symbol.asyncIterator]();
  const nextLine = async () => {
    const { value, done } = await lines.next();
    if (done) throw new Error("the window watcher stopped");
    return value.trim();
  };
  const ready = await nextLine();
  if (ready !== "ready") throw new Error(`the window watcher said ${ready}`);

  return {
    async start(dataDir, webViewProfile) {
      const startedAt = Date.now();
      const app = spawn(executable, [], {
        env: plainEnvironment(dataDir, webViewProfile),
        stdio: "ignore",
      });
      const pid = app.pid;
      if (pid === undefined) throw new Error("Arden Code did not start");
      watcher.stdin.write(`${pid}\n`);
      const shownAt = Number(await nextLine());
      if (!shownAt) throw new Error("Arden Code did not show its window within 30 seconds");
      const pageBegan = pageBeganAt(dataDir, startedAt);
      return {
        pid,
        process: app,
        milliseconds: shownAt - startedAt,
        pageBeganAfter: pageBegan === undefined ? undefined : pageBegan - startedAt,
      };
    },
    async close({ pid, process: app }) {
      closeMainWindow(pid);
      await new Promise<void>((resolve) => {
        if (app.exitCode !== null) resolve();
        else app.once("exit", () => resolve());
        setTimeout(resolve, 10_000);
      });
      try {
        execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // Already gone.
      }
    },
    stop() {
      watcher.stdin.end();
      watcher.kill();
    },
  };
}

export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
