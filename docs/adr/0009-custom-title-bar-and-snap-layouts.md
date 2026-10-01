# 0009. Custom title bar with our own Snap Layouts module

- Status: Accepted
- Date: 2026-09-29

## Context

A custom title bar makes room for navigation and search. But on Windows 11, hovering the Maximize
button only shows the Snap Layouts picker if the window reports that spot as a maximize button: it
must answer the `WM_NCHITTEST` message with `HTMAXBUTTON`. Tauri doesn't support this (tauri#4531,
open since 2022). Community plugins handle it, but each has only a few thousand downloads.

## Decision

- **Title bar:** drawn by the app, with drag regions, double-click to maximize, the Alt+Space system menu, and accessible window buttons styled like Windows'.
- **Snap Layouts:** `arden-windows` places a small native overlay over our Maximize button that answers `HTMAXBUTTON`. We own this code.
- **Fallback:** a "Use native title bar" setting.
- **Effects:** no Mica or Acrylic.

## Consequences

- We maintain a small amount of Win32 code.
- High-DPI, multiple monitors, keyboard and screen-reader behavior of the window buttons need a manual test checklist.

## What was built (ticket 8)

- `arden_windows::snap_layouts::MaximizeOverlay` is a child window of the main window: `WS_CHILD | WS_CLIPSIBLINGS`, no extended styles (a layered window cannot be hit, a transparent one is skipped), a hollow brush, and it never paints, so the page's button shows through. It answers `WM_NCHITTEST` with `HTMAXBUTTON` everywhere on it and `WM_MOUSEACTIVATE` with `MA_NOACTIVATE`, so the page keeps the keyboard focus.
- It handles the press itself: Windows' own handling of a press on a Maximize button waits in a loop for the release and would maximize the overlay. The overlay holds the pointer from the press, and a release on it is a click; a release elsewhere is not. It reports how the button should look (normal, hover, pressed) only when that changes, and asks once per visit to be told when the pointer leaves.
- The page measures its Maximize button and sends its area in the screen's pixels (`devicePixelRatio` covers the display scaling) with `set_maximize_button`, again when the window is resized, the zoom changes the button, or the display scaling changes (another monitor). It sends `null` with the title bar of Windows, which has Snap Layouts of its own. Rust raises the overlay above the web engine's window on every move.
- `maximize-button-changed` carries the look to the page, which draws it with `data-look` on the button; a click maximizes or restores the window through Tauri. Keyboard use goes to the page's button as before.
- If Windows cannot make the overlay, it is logged and the button works without Snap Layouts.
- The window's minimum width is 500 px (it was 800): Windows asks for 500 or less, or a window does not fit the zones of a layout. The sidebar (180 px at least) and the session view (320 px at least) fit in it.
- Tests: the overlay is driven with real Windows messages in `crates/arden-windows/tests/snap_layouts.rs`; the page's side in `TitleBar.test.tsx`, also at 150% scaling; the real app in `e2e/titlebar.spec.ts` asks Windows what is at the Maximize button and how narrow the window can be. The rest is in [the title bar checklist](../title-bar-checklist.md).
