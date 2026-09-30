import { execFileSync } from "node:child_process";

import { z } from "zod";

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

export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
