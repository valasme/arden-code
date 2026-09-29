# 0021. The `arden-code` terminal command

- Status: Accepted
- Date: 2026-09-29

## Context

Developers expect to open a folder from the terminal, as with `code .`. A Windows GUI program can't
print to the terminal it was started from, so `--version` and `--help` need a console program.
Explorer integration ("Open in Arden Code") was explicitly declined.

## Decision

- **The launcher:** `crates/arden-cli` builds a small console program, installed as `bin\arden-code.exe`.
  - `arden-code` opens or focuses the app.
  - `arden-code <folder>` (or `arden-code .`) opens that folder as a project.
  - `--version` and `--help` print in the terminal.
- **Forwarding:** the launcher hands its arguments to the running instance through the single-instance mechanism.
- **Installation:** the NSIS installer adds `bin\` to the user PATH (a checkbox, on by default) and removes it on uninstall.
- **Not doing:** Explorer context-menu integration.

## Consequences

- The build has to produce the launcher before bundling.
- Terminals that were already open before installation need a restart to see the command.
