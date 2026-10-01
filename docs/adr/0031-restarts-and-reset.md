# 0031. Starting the app again, and resetting it

- Status: Accepted
- Date: 2026-10-01
- Supersedes the part of [0024](0024-areas-context-menus-and-browser-features.md) on resetting Arden Code.

## Context

Arden Code starts itself again to finish a reset (ADR 0024), for a setting that is read only at start (hardware
acceleration), and when its web engine is gone (ADR 0025). Tauri's restart starts the new process and ends the old one
at once, and two things went wrong:

- **The reset failed on files in use.** The web engine (WebView2) keeps its files in the app's `local` folder, and its
  processes go on for about a tenth of a second after the app has ended. The new start, which wipes that folder,
  got there first. By then it had already deleted the settings, and the request stayed, so a later start deleted
  the settings again. The tests did not see it: they kept the engine's files outside the app's folder.
- **A development session lost its app.** `tauri dev` serves the pages and stops when the process it ran ends. A
  restart ended that process, so `tauri dev` stopped the dev server and ended, while the new start ran on with nothing
  to show. Tauri does not plan to change this (tauri-apps/tauri#6163).

## Decision

- **The app restarts itself, not Tauri** (`restart` in the desktop crate). Asking for a restart ends the event loop;
  once the loop has returned, the process starts its program again with the same arguments, and ends. Clippy refuses
  Tauri's `restart` and `request_restart` (`clippy.toml`).
- **A new start waits for the old one.** The old start hands over its identity, its process id and start time, in
  `ARDEN_CODE_RESTARTED_FROM`; the start time keeps a recycled id from being taken for it. Before anything else, the new
  start waits for that process and everything it started (the web engine, the engine's helpers, agent programs) to
  end, for up to 10 seconds.
- **A reset goes in a safe order:** logs, crash reports and caches first, then the settings, and the request last. A
  file that another program has open, as virus scanners do for a moment, is tried again for up to 3 seconds. A reset
  that cannot finish keeps the settings and the request, the next start finishes it, and the person is told with
  `ARD-APP-006`. A reset that would reach a folder not named like the app's removes nothing.
- **The web engine's files are the app's.** The window gives the engine the app's `local` folder, also when
  `ARDEN_CODE_DATA_DIR` moves it. A reset wipes them, and the end-to-end tests lay out the folders as an install does.
- **A development build runs under a restarter.** The process `tauri dev` runs shows no window: it runs the app as its
  child, and runs it again when the app exits with the restart code (Tauri's `RESTART_EXIT_CODE`); the new child waits
  for the old one as above. `tauri dev` keeps serving across restarts, and the session ends when the app is closed.
  Release builds have no restarter.

## Consequences

- A development session has two `arden-code.exe` processes: the restarter and the app.
- `pnpm check:dev-restart` runs a development session through a restart and a reset. It needs `tauri dev` and a few
  minutes of building the first time, so it runs by hand, not in CI. Run it after changing how the app restarts.
- A restart takes as long as the old web engine needs to end, about a tenth of a second.
- Anything added later that keeps files open in the app's folders is covered: it ends with the old start, and the new
  one waits for it.
