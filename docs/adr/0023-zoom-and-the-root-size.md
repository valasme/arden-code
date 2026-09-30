# 0023. Zoom, and the size of one rem

- Status: Accepted
- Date: 2026-09-30

## Context

The plan gives a type scale of 11, 12, 13, 14, 16, 20 and 24 px, and a zoom setting from 80% to 200%
(section 6.3), also reachable with Ctrl+= / Ctrl+− / Ctrl+0. Building the setting (ticket 13) showed
that the scale itself was wrong on screen: `html` was given `text-sm` (13px), and every `rem` is
measured against the root element's size, so one rem was 13px. `text-xs` drew at 9.75px, `p-4` at
13px, and the title bar was 26px tall instead of 32px. The screenshot baselines had recorded it.

## Decision

- **The root is the browser default, 16px, times `--zoom`.** `html { font-size: calc(100% * var(--zoom, 1)) }`. The default text size (13px) is set on `body`, where it does not change what a rem means.
- **Zoom scales every rem, and so the whole UI.** Sizes are written in Tailwind's rem-based utilities, so one number moves everything: text, spacing, icons, controls, dialogs and toasts. The settings write `--zoom` on the root element before the first render, so there is no flash.
- **This is the same mechanism the Windows text size uses** (ticket 14): it will multiply into `--zoom`, not add a second scaling path.
- **Not the web engine's own zoom.** Tauri's webview zoom would also scale borders, and cannot be tested in a browser test. Sizes written in pixels (panel widths, 1px borders) stay as they are; that is the intended behavior for a border.
- **Ctrl+= / Ctrl+− move between the usual browser levels** (80, 90, 100, 110, 125, 150, 175, 200), from any value in between. Ctrl and the plus sign zooms in too (Shift+= on most layouts, or the number pad plus). Ctrl+0 returns to 100%. Rust keeps the stored number between 80 and 200, also for a hand-edited file.
- **Reduced motion** is one attribute, `data-motion="reduce"` on the root, computed from the setting and from Windows. With it, every animation and transition ends at once. The setting can turn animations on even when Windows asks for fewer, which the `prefers-reduced-motion` media query alone could not.
- **The defaults come from Rust.** `pnpm bindings` also writes `src/ipc/defaults.gen.ts` from `Settings::default()`, and a contract test fails when it drifts, so the UI never has a second copy of a default to keep in step.
- **Side panel widths** live in `settings.json` under `layout`, saved once a drag has stopped for 400 ms (or the window closes).

## Consequences

- The screenshot baselines changed in this ticket: the interface is now the size the plan describes.
- Anything sized in `em` or `rem` follows the zoom. Anything that must not (a hairline, a scrollbar) is sized in pixels.
