# 0020. Security and supply chain

- Status: Accepted
- Date: 2026-09-29

## Context

Arden Code will launch agents that can edit files and run commands. It also renders agent output,
which is untrusted and may be the result of prompt injection. npm supply-chain attacks were common in
2025–2026.

## Decision

- **App hardening:**
  - A strict Content Security Policy, with nothing loaded remotely.
  - Minimal capabilities for each window, and Tauri's isolation pattern.
  - Browser shortcuts and the default context menu disabled in release builds.
  - Dev tools available only in developer mode.
- **Untrusted content:**
  - Markdown renders without raw HTML.
  - Remote images are blocked by default.
  - Links open in the default browser, and unusual link types need confirmation.
- **Child processes:** executables are resolved safely, untrusted arguments never pass through batch wrappers, and every child runs in a Job Object.
- **Secrets:** any future secrets go into Windows Credential Manager, never into `settings.json`.
- **Supply chain:**
  - pnpm refuses package releases younger than 2 days (`minimumReleaseAge: 2880`), and install scripts need approval (`allowBuilds`).
  - Renovate waits 2 days before proposing an update.
  - `cargo-deny` checks for security advisories and license problems.
  - CI builds carry provenance attestations.
- **GitHub:** private vulnerability reporting, Dependabot alerts, secret scanning and push protection are on.

## Consequences

- New dependency versions arrive about 2 days later than they otherwise would.
- There is a little more friction when adding packages that run install scripts.
