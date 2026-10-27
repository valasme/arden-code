# 0060. The Linux window frame

- Status: Accepted
- Date: 2026-10-27
- Decides [#180](https://github.com/valasme/arden-code/issues/180). Changes
  [0009](0009-custom-title-bar-and-snap-layouts.md) and [0034](0034-the-logo-and-the-window-menu.md)
  on Linux.

## Context

The page is one design and the frame follows the platform. On Windows the app draws its title bar,
with Windows' caption: a Window menu button that opens the system menu, Alt+Space, Snap Layouts on
Maximize, and 46-pixel window buttons whose Close turns red. Linux has no Snap Layouts and no system
menu the app can open, and its compositor owns where the window goes. The title bar also holds what
is the app's: the logo, back and forward, the search strip and the layout controls (ADR 0033).

## Decision

- **Linux keeps the title bar the app draws** (client-side decorations), so the layout controls and
  the search strip are where they are on Windows, and the page stays one design.
- **Its window buttons follow Linux:** Minimize, Maximize or Restore, and Close, square like the
  bar's other buttons and quiet like GTK's, with no red Close. They keep the arrow (ADR 0037).
- **No Window menu, Alt+Space or right-click menu, and no Snap Layouts.** The commands stay in the
  contract and do nothing on Linux.
- **The desktop's own frame** is the fallback, as Windows' is: Settings → Advanced → "Use the system
  title bar" turns on the desktop's decorations.
- **The smallest size stays 500 × 560.** On Linux it is the smallest size the sidebar and the session
  view fit in, which is the reason it holds on Windows besides Snap Layouts.
- The window is not sized by measuring its outer frame on Linux, as a window that is not shown yet
  has none.

## Consequences

- The page asks `currentPlatform()` (from `window.__ARDEN_PLATFORM__`) for the frame; a page Rust told
  nothing, such as a component test or a browser, is drawn as on Windows.
- Dragging, double-click to maximize and resizing an undecorated window come from Tauri on Linux.
