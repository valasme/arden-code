# 0047. Holding the smallest window size

- Status: Accepted
- Date: 2026-10-11
- Changes "smallest size" in plan section 6.1. Keeps the width set in
  [0009](0009-custom-title-bar-and-snap-layouts.md).

## Context

The maintainer asked for a minimum window size (#128). The window already had one, 500 × 560, and a drag on its edge
stops there. But it was not held everywhere, and at that size it looked broken:

- A program that sizes the window itself, such as a window tool, could make it smaller: the window draws its own frame,
  so Windows does not hold it to its smallest size. That size was then saved, and the window opened at it next time.
- At 500 × 560 the title bar's search strip cut its words to "S…", and New session in the sidebar broke onto a second
  line in its 28px row.

Raising the smallest size was weighed and turned down: Windows asks for 500px or less, or the window does not fit the
narrower zones of Snap Layouts (ADR 0009), and the layout does fit at 500 once those two things are fixed.

## Decision

- **The smallest size stays 500 × 560,** set in `tauri.conf.json`, the one place Rust reads it from.
- **It holds on every path.** A window opened from a saved size smaller than it opens at it. A window made smaller by
  another program grows back to it at once, unless it is minimized or maximized.
- **The layout is tidy at that size.** A sidebar row's text stays on one line, and a row's shortcut steps aside when
  the sidebar is narrower than 13rem. The search strip shows its words whole, or, below 15rem, only its icon and its
  shortcut; the words stay for assistive technology.

## Consequences

- The window can no longer be found smaller than its smallest size, after a restart included.
- A window tool that sizes windows below 500 × 560 sees Arden Code grow back to it.
- The shortcuts of New session and Settings are not shown in a narrow sidebar; their tooltips and the cheat sheet
  still show them.
