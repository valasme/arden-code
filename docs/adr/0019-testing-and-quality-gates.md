# 0019. Testing and quality gates

- Status: Accepted
- Date: 2026-09-29

## Context

The foundation has to be trustworthy before features land on it. Arden Code is Windows-only, and
WebView2 speaks the Chrome DevTools Protocol, which means Playwright can drive the real app.

## Decision

- **Tests:**
  - Rust: cargo-nextest and insta snapshots.
  - TypeScript: Vitest 5, with browser mode on Chromium plus Testing Library and axe for components.
  - Playwright against the Vite dev server with the Rust side mocked.
  - Playwright attached to the real app's WebView2 over CDP (debug builds only).
  - Screenshot tests of the design system page.
- **Contracts:** binding drift, hard-coded text and stale brand outputs all fail CI.
- **Performance gates:**
  - Cold start ≤ 1.0 s with no white frame; warm start ≤ 0.4 s.
  - Idle memory ≤ 200 MB and near-zero idle CPU.
  - 60 fps with 10,000 streamed messages.
  - Settings changes applied in under 50 ms.
- **No size budgets:** there are deliberately no installer or bundle size limits.

## Consequences

- End-to-end tests only run on Windows, which matches the platform.
- Coverage is tracked but not enforced.
