# 0013. Logging, diagnostics and crash handling

- Status: Accepted
- Date: 2026-09-29

## Context

Without telemetry, the only way to debug a user's problem is data the user chooses to share.

## Decision

- **Logs:** `tracing` writes JSON lines, one file per day in `%LOCALAPPDATA%\io.github.valasme.arden\logs\`.
  - The last 14 days are kept, capped at 100 MB.
  - The user folder path, tokens and email addresses are redacted.
  - UI logs are forwarded over IPC into the same files.
- **In-app log viewer:** filters by level, source and text.
- **Export diagnostics:** a local zip with logs, redacted settings, system information and crash reports. Nothing is uploaded automatically.
- **Report a bug:** opens a pre-filled GitHub issue containing system information only.
- **Crash handling:**
  - A Rust panic hook writes a crash report, and the next launch offers to export diagnostics.
  - If the WebView2 process fails, the UI reloads and shows a notice.

## Consequences

- Support depends on users attaching an export.
- Redaction rules need tests.
