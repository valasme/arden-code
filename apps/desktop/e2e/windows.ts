import { execFileSync } from "node:child_process";

import { z } from "zod";

/** Helpers that look at and move the app's real window from outside, through Win32. */

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const windowSchema = rectSchema.extend({ maximized: z.boolean(), minimized: z.boolean() });

export type WindowInfo = z.infer<typeof windowSchema>;

const win32 = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  /** The visible top-level window of a process with the given title. */
  public static IntPtr Find(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint owner; GetWindowThreadProcessId(h, out owner);
      if (owner == pid && IsWindowVisible(h)) {
        var text = new StringBuilder(256); GetWindowText(h, text, 256);
        if (text.ToString() == title) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int height, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
}
"@
function Main-Window($id) { [W]::Find($id, "Arden Code") }
`;

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", win32 + script], {
    encoding: "utf8",
  }).trim();
}

/** The window's place and state, or `undefined` while it is hidden (Windows reports no handle). */
export function getWindow(pid: number): WindowInfo | undefined {
  const output = powershell(`
    $h = Main-Window ${pid}
    if ($h -eq 0) { return }
    $r = New-Object W+RECT
    [void][W]::GetWindowRect($h, [ref]$r)
    @{ x = $r.Left; y = $r.Top; width = $r.Right - $r.Left; height = $r.Bottom - $r.Top;
       maximized = [W]::IsZoomed($h); minimized = [W]::IsIconic($h) } | ConvertTo-Json -Compress
  `);
  return output ? windowSchema.parse(JSON.parse(output)) : undefined;
}

export function moveWindow(pid: number, rect: Pick<WindowInfo, "x" | "y" | "width" | "height">) {
  powershell(`
    $h = Main-Window ${pid}
    [void][W]::MoveWindow($h, ${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}, $true)
  `);
}

const showCommands = { maximize: 3, minimize: 6, restore: 9 } as const;

export function showWindow(pid: number, command: keyof typeof showCommands) {
  powershell(`[void][W]::ShowWindow((Main-Window ${pid}), ${showCommands[command]})`);
}

/** Asks the window to close, as the close button would. */
export function closeMainWindow(pid: number) {
  powershell(`[void][W]::PostMessage((Main-Window ${pid}), 0x10, [IntPtr]::Zero, [IntPtr]::Zero)`);
}

/** The bounds of all monitors together. */
export function virtualScreen(): z.infer<typeof rectSchema> {
  const output = powershell(`
    $s = [System.Windows.Forms.SystemInformation]::VirtualScreen
    @{ x = $s.X; y = $s.Y; width = $s.Width; height = $s.Height } | ConvertTo-Json -Compress
  `);
  return rectSchema.parse(JSON.parse(output));
}

/** Whether a menu is open anywhere: Windows gives every popup menu the window class "#32768". */
export function isMenuOpen(): boolean {
  return powershell(`[W]::FindWindow("#32768", $null) -ne 0`) === "True";
}

/** How many Arden Code processes are running. */
export function countAppProcesses(): number {
  return Number(
    powershell(`(Get-Process arden-code -ErrorAction SilentlyContinue | Measure-Object).Count`),
  );
}
