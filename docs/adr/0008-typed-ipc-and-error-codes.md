# 0008. Typed IPC and error codes

- Status: Accepted
- Date: 2026-09-29

## Context

Calls between the UI and Rust ("IPC") are the seam where most integration bugs happen. Errors shown
to users should be traceable in the logs, including from a screenshot.

## Decision

- **Bindings:** tauri-specta 2 generates `apps/desktop/src/ipc/bindings.ts` from Rust (commands, events, types). CI regenerates it and fails on drift.
- **Errors:** every command returns `Result<T, AppError>`.
  - `AppError` has a stable `code` in the form `ARD-<AREA>-<NNN>`, with areas `APP`, `SET`, `IPC`, `LOG`, `PROC`, `AGT`, `UPD`, `WIN` and `FS`.
  - It also has a translation key for its message, and optional details.
- **Streams and events:** streams use Tauri channels, and state changes are broadcast as typed events. TanStack Query invalidates cached data when those events arrive.

## Consequences

- There are no hand-written, stringly typed calls.
- tauri-specta is still a release candidate, so it's pinned and its surface is kept small.
- Error codes need a registry, `docs/error-codes.md`, added in M3.
