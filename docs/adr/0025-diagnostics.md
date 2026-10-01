# 0025. Diagnostics: logs, bundles and crash recovery

- Status: Accepted
- Date: 2026-09-30

## Context

Plan sections 6.10 and 11 ask for logs a person can read, a bundle they can attach to a bug report, an offer to export it after a crash, and a window that recovers when the web engine stops.

## Decision

- **The log level is a setting** (`advanced.logLevel`: error, warn, info, debug). It is read from the settings file before logging starts and changes live afterwards, through a reload handle on the log filter. Debug is for finding a bug and records more, such as every settings change.
- **The log viewer** (`/logs`) reads the newest entries of the JSON log files in Rust (`read_logs`) and filters them in the page by level, source and words. It shows 200 at a time. It is opened from Advanced, and the logs folder can be opened from there and from the viewer.
- **The diagnostics bundle** is a zip with the recent log files, `settings.json`, `system-info.txt` and the crash reports. Everything in it was already free of private details when it was written: logs and crash reports are redacted at the source, and the settings hold no paths or names. The person chooses where it goes; nothing is sent anywhere.
- **Crash recovery**: a panic leaves a crash report. At the next start the page asks once whether to export diagnostics. Either answer marks the reports as seen (`acknowledged.txt`), and they stay on disk and in any later bundle.
- **Report a bug** opens the project's bug report form in the browser with the system information already filled in. Only the system information goes into the address, never logs.
- **A web engine that stops** (renderer crash or hang) is reloaded by Rust, which remembers it and lets the reloaded page ask for a one-time notice (ARD-WIN-002). If the browser process itself exits, nothing is left to reload, so the app restarts.

## Consequences

- The error registry gained ARD-LOG-002 (diagnostics could not be saved) and ARD-WIN-002 (the web engine stopped).
- Tests reach the crash and failure paths in the real app: the panic button of the developer errors page, and killing the renderer process of the web engine.
