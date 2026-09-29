# 0005. Light monorepo

- Status: Accepted
- Date: 2026-09-29

## Context

The Tauri template puts the frontend and one Rust crate side by side. Arden Code will grow a
substantial amount of Rust logic: settings, diagnostics, process supervision, agent drivers. That
logic should be testable without starting Tauri. It will also have a brand pipeline and documentation.

## Decision

Use a pnpm workspace and a Cargo workspace:

- **`apps/desktop`:** the React + Vite UI, with `src-tauri` as the app crate.
- **`crates/arden-*`:** the Rust logic.
  - `core`, `settings`, `diagnostics`, `process`, `agents`, `windows`, `cli`
- **`brand/`:** the asset pipeline.
- **`docs/`:** the plan and these records.

There is a single Cargo `target/` directory at the root. A shared `packages/ui` is split out only once
a second consumer, such as a website, exists.

## Consequences

- Rust modules have clear boundaries and fast unit tests.
- Incremental builds stay small.
- Slightly more configuration is needed up front.
