# Arden Code

A Windows 11 desktop cockpit for Claude Code and Codex, built on Tauri 2 and React. Pre-alpha: the app foundation is under construction.

## Sources of truth

- `GLOSSARY.md`: the project's language. Name code, tickets, commits and UI copy with its terms.
- `docs/PLAN.md`: the current plan. Read the section for the area you're changing first.
- `docs/adr/`: why each decision was made. To change a decision, write a new ADR that supersedes the old one.

## Workflow

- Each ticket (a GitHub issue) gets its own branch and pull request, and the pull request closes the ticket.
- Build test-first with /tdd.
- Before opening the pull request, review the diff with /code-review. Run its Standards and Spec axes yourself, one after the other, with separate reports: this repo works in a single agent, without subagents.
- Squash-merge once CI is green.
- Write Conventional Commits.
