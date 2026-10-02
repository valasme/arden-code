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
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int x, int y, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MINMAXINFO { public POINT Reserved, MaxSize, MaxPosition, MinTrackSize, MaxTrackSize; }
  [DllImport("user32.dll", EntryPoint = "SendMessage")] public static extern IntPtr SendMinMax(IntPtr h, uint message, IntPtr w, ref MINMAXINFO l);
  [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr parent, POINT point, uint flags);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT point);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder text, int max);
  /** The window inside the app that receives keys for the web page. */
  public static IntPtr FindPage(IntPtr top) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(top, (h, l) => {
      var text = new StringBuilder(256); GetClassName(h, text, 256);
      if (text.ToString() == "Chrome_RenderWidgetHostHWND") { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
function Main-Window($id) { [W]::Find($id, "Arden Code") }
# Real input goes to whichever window is in front: brings the window forward, and says whether it is.
function Bring-Forward($top) {
  [W]::SetForegroundWindow($top) | Out-Null
  Start-Sleep -Milliseconds 300
  [W]::GetForegroundWindow() -eq $top
}
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

/**
 * What Windows is told is at a point of the window's client area, given in the screen's pixels:
 * the answer of the window there to `WM_NCHITTEST`, as when the pointer rests on it. Snap Layouts
 * appear where the answer is 9, a Maximize button.
 */
export function hitTest(pid: number, x: number, y: number): number {
  return Number(
    powershell(`
      $top = Main-Window ${pid}
      $point = New-Object W+POINT
      $point.X = ${Math.round(x)}; $point.Y = ${Math.round(y)}
      # Skipping hidden and transparent windows, as the pointer does.
      $child = [W]::ChildWindowFromPointEx($top, $point, 5)
      [void][W]::ClientToScreen($top, [ref]$point)
      $position = [IntPtr](($point.Y -shl 16) -bor ($point.X -band 0xFFFF))
      [W]::SendMessage($child, 0x84, [IntPtr]::Zero, $position).ToInt64()
    `),
  );
}

/**
 * How narrow the window tells Windows it can be made, in the screen's pixels: its answer to
 * `WM_GETMINMAXINFO`, which Windows asks before it fits the window into a zone of a Snap Layout.
 * Windows copies the answer across from the app's process.
 */
export function narrowestWidth(pid: number): number {
  return Number(
    powershell(`
      $info = New-Object W+MINMAXINFO
      [void][W]::SendMinMax((Main-Window ${pid}), 0x24, [IntPtr]::Zero, [ref]$info)
      $info.MinTrackSize.X
    `),
  );
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

/**
 * Presses a key the way a keyboard does, so that it goes through the same path as a real key press
 * and reaches the web engine's own shortcuts (reload, print, find ...). Key presses sent through
 * the debugging port never do.
 *
 * Real input goes to whichever window is in front, so the app's window is brought forward first and
 * nothing is pressed unless it really is in front. Returns whether the key was pressed.
 */
export function pressKey(pid: number, virtualKey: number): boolean {
  const pressed = powershell(`
    $top = Main-Window ${pid}
    if (-not (Bring-Forward $top)) { "no"; exit }
    [W]::keybd_event(${virtualKey}, 0, 0, [UIntPtr]::Zero)
    [W]::keybd_event(${virtualKey}, 0, 2, [UIntPtr]::Zero)
    "yes"
  `);
  return pressed === "yes";
}

/**
 * Clicks a point of the page the way a mouse does, through Windows and the web engine's own input
 * handling. A click sent through the debugging port, or any click while a debugging client is
 * attached to the page, reaches the page with other timing and can miss bugs that real clicks hit:
 * a test that needs a real click detaches from the page first.
 *
 * The point is in the page's pixels: CSS pixels times the page's `devicePixelRatio`. As with
 * `pressKey`, nothing is clicked unless the app's window really is in front. Returns whether the
 * click was made.
 */
export function clickAt(pid: number, x: number, y: number): boolean {
  const clicked = powershell(`
    $top = Main-Window ${pid}
    if (-not (Bring-Forward $top)) { "no"; exit }
    $point = New-Object W+POINT
    $point.X = ${Math.round(x)}; $point.Y = ${Math.round(y)}
    [void][W]::ClientToScreen([W]::FindPage($top), [ref]$point)
    [void][W]::SetCursorPos($point.X, $point.Y)
    Start-Sleep -Milliseconds 100
    # The left button, down and up.
    [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    "yes"
  `);
  return clicked === "yes";
}

/** Virtual key codes of the keys the tests press. */
export const virtualKeys = { f5: 0x74 } as const;

/**
 * How much of the window's height is frame and title bar that Windows draws: the window's height
 * minus the height of what is inside it. The app draws its own title bar inside the window, so
 * with it this is close to nothing; with the title bar of Windows it is the height of that bar.
 */
export function frameHeight(pid: number): number {
  return Number(
    powershell(`
      $window = Main-Window ${pid}
      $outer = New-Object W+RECT; $inner = New-Object W+RECT
      [void][W]::GetWindowRect($window, [ref]$outer)
      [void][W]::GetClientRect($window, [ref]$inner)
      ($outer.Bottom - $outer.Top) - ($inner.Bottom - $inner.Top)
    `),
  );
}

/** The command lines of the web engine's processes that use the given profile folder. */
export function webViewCommandLines(profileFolder: string): string[] {
  const output = powershell(`
    $lines = Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
      Where-Object { $_.CommandLine -like "*${profileFolder.replaceAll("'", "''")}*" } |
      ForEach-Object { $_.CommandLine }
    ConvertTo-Json -InputObject @($lines) -Compress
  `);
  return z.array(z.string()).parse(JSON.parse(output || "[]"));
}

/** Ends the process of the web engine that draws the page, as a crash of it would. */
export function killWebViewRenderers(profileFolder: string) {
  powershell(`
    Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
      Where-Object {
        $_.CommandLine -like "*--type=renderer*" -and
        $_.CommandLine -like "*${profileFolder.replaceAll("'", "''")}*"
      } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  `);
}

/** Ends every Arden Code process, also one the app started for itself by restarting. */
export function killAllApps() {
  powershell(`Get-Process arden-code -ErrorAction SilentlyContinue | Stop-Process -Force`);
}
