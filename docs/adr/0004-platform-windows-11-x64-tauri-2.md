# 0004. Windows 11 x64 on Tauri 2

- Status: Accepted
- Date: 2026-09-29

## Context

Windows 10 reached end of support in October 2025, although WebView2 still receives updates on it.
The maintainer only targets Windows. Tauri 2 is stable at 2.12, while Tauri 3 entered alpha in
September 2026 with breaking changes (an explicit choice of web runtime, new plugin hook signatures).

## Decision

- **Supported:** Windows 11 (build 22000 or later), x64 only. The installer refuses Windows 10 with a friendly message.
- **Stack:** Tauri 2.12 with evergreen WebView2.
- **Tauri 3:** revisit when it reaches a stable release.

## Consequences

- Windows 11-only features (Snap Layouts) can be relied on.
- The test matrix is small: 24H2 and 25H2, x64.
- Windows 10 and ARM64 users are excluded.
- A future move to Tauri 3 is planned work, not a surprise.
