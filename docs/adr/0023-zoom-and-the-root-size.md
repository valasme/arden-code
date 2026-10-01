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
- **The Windows text size multiplies into the same number** (ticket 14): the interface scale is the zoom times the text size (Settings → Accessibility → Text size, 100% to 225%), and Appearance → "Follow Windows text size" leaves it out.
- **Windows' regional format and text size are read by Rust** (`arden_windows::preferences`): `GetUserDefaultLocaleName` and the `TextScaleFactor` registry value. Windows only announces changes to these through a window's message loop, which the web engine owns, so a thread looks again every 1.5 seconds and sends `system-preferences-changed` when something differs. The UI writes dates, numbers and relative times with `Intl` in that locale (`useFormatters`), or in English (US) when General → Regional format says so.
- **Tests do not touch the real Windows settings.** In debug builds only, `ARDEN_CODE_SYSTEM_PREFERENCES_FILE` names a JSON file that stands in for them, and the end-to-end tests rewrite it while the app runs. Release builds do not look at the variable.
- **Side panel widths** live in `settings.json` under `layout`, saved once a drag has stopped for 400 ms (or the window closes).

## Consequences

- The screenshot baselines changed in this ticket: the interface is now the size the plan describes.
- Anything sized in `em` or `rem` follows the zoom. Anything that must not (a hairline, a scrollbar) is sized in pixels.

## Shortcut rebinding (ticket 15)

- **What is stored:** only the commands a person changed, in `settings.json` under `keyboard.shortcuts` (command id to a list of up to three shortcuts). A command that is not there has its defaults; an empty list means no shortcut. Rust drops anything that is not a shortcut, also in a hand-edited file.
- **One source:** the palette, the tooltips, the cheat sheet, the Keyboard tab and the key handler all read the same effective shortcuts, so they cannot disagree.
- **Recording** takes every key press for itself (a capturing listener that stops it), so pressing an existing shortcut to record it does not also run it. Esc cancels. The recorded keys are written by `shortcutFromEvent`: a shifted symbol is named by its key (`Ctrl+Shift+1`, not `Ctrl+!`) and a non-Latin layout by the Latin key in the same place.
- **Refused before saving:** Windows' own shortcuts (Alt+F4, Alt+Tab, Ctrl+Shift+Esc and the like), the keys that edit text (Ctrl+C, X, V, A, Z, Y), Ctrl and Alt together (AltGr), and a bare key that is typed (a shortcut needs Ctrl or Alt, unless it is a function key). A shortcut that another command has is flagged with a choice to move it or cancel.

## Watching Windows without a timer (issue #31)

- Windows' text size and regional format are no longer read every 1.5 seconds. `arden_windows::registry::KeyWatcher` asks Windows to signal a change to `HKCU\Software\Microsoft\Accessibility` and `HKCU\Control Panel\International` (`RegNotifyChangeKeyValue`), and its thread sleeps until one does or the app ends, so nothing wakes while the app is idle for these settings. (The one thread that still wakes on a timer is the update check, every six hours, as ADR 0030 decides.) The regional format is read from `LocaleName` in that key, the value the notification is about, with the locale Windows reports to the process as the fallback. One change of the regional format writes several values, so a change is only sent to the UI when the preferences differ from the last ones.
- The stand-in file of debug builds (`ARDEN_CODE_SYSTEM_PREFERENCES_FILE`) is still read on a timer, as the end-to-end tests rewrite it while the app runs; release builds never look at it.
- If Windows cannot be watched, that is logged, and a change is seen at the next start.
