# 0002. Product identity: Arden Code

- Status: Accepted
- Date: 2026-09-29

## Context

In 2026 the name "Arden" alone is crowded among AI tools. There is an agent-wallet product, an
agent-governance tool and an AI audit startup, and the obvious GitHub organization names are taken.

The project is personal and non-commercial, and it is aimed at programmers. The app identifier can
never change without orphaning user data and breaking updates.

## Decision

- **Product name:** Arden Code. **Tagline:** "A Windows cockpit for Claude Code and Codex."
- **Repository:** `valasme/arden-code` (public). **Local folder:** `%USERPROFILE%\Projects\arden-code`.
- **App identifier:** `io.github.valasme.arden`. It is permanent and deliberately not tied to a domain, which could lapse.
- **Executable:** `arden-code.exe`. **Terminal command:** `arden-code` (see [0021](0021-terminal-command.md)).
- **Internal names:** Rust crates `arden-*`, private JS packages `@arden/*`.
- **Domain:** none.
- **Commits:** made with the maintainer's GitHub noreply address, so no personal email appears in public history.

## Consequences

- The identifier (`…arden`) and the repository name (`arden-code`) differ on purpose. That's harmless.
- Renaming the product later only touches display names. The identifier stays.
