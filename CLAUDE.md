# Arden Code

A Windows 11 desktop cockpit for Claude Code and Codex, built on Tauri 2 and React. Pre-alpha: the app foundation is under construction.

## Sources of truth

- `GLOSSARY.md`: the project's language. Name code, tickets, commits and UI copy with its terms.
- `docs/PLAN.md`: the current plan. Read the section for the area you're changing first.
- `docs/adr/`: why each decision was made. To change a decision, write a new ADR that supersedes the old one.

## Workflow

- The whole foundation is built on one integration branch, `foundation`, with one draft pull request that is merged when every ticket is done.
- Work the tickets in order. After each ticket: commit, push, and tick it off, so a session can end at any point without losing work.
- Build test-first with /tdd.
- At the end, review the full diff with /code-review. Run its Standards and Spec axes yourself, one after the other, with separate reports: this repo works in a single agent, without subagents.
- Write Conventional Commits.
