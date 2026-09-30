`# 0021. The `arden-code` terminal command
`
`- Status: Accepted
`- Date: 2026-09-29
`
`## Context
`
`Developers expect to open a folder from the terminal, as with `code .`. A Windows GUI program can't
`print to the terminal it was started from, so `--version` and `--help` need a console program.
`Explorer integration ("Open in Arden Code") was explicitly declined.
`
`## Decision
`
`- **The launcher:** `crates/arden-cli` builds a small console program, installed as `bin\arden-code.exe`.
`  - `arden-code` opens or focuses the app.
`  - `arden-code <folder>` (or `arden-code .`) opens that folder as a project.
`  - `--version` and `--help` print in the terminal.
`- **Forwarding:** the launcher hands its arguments to the running instance through the single-instance mechanism.
`- **Installation:** the NSIS installer adds `bin\` to the user PATH (a checkbox, on by default) and removes it on uninstall.
`- **Not doing:** Explorer context-menu integration.
`
`## Consequences
`
`- The build has to produce the launcher before bundling.
`- Terminals that were already open before installation need a restart to see the command.
`
`## What was built (ticket 26)
`
`- \`crates/arden-cli\` builds \`arden-cli.exe\`, which the installer puts in \`bin\arden-code.exe\` (the app itself is \`arden-code.exe\` one folder up). \`beforeBuildCommand\` builds it before bundling.
`- \`arden-code\` starts the app; \`arden-code <folder>\` and \`arden-code .\` start it with \`--open <full path>\`. A running copy gets the arguments through the single-instance mechanism, opens the folder as a project (the same folder is one project, whatever the case of its letters) and starts a session in it. \`--version\` and \`--help\` print in the terminal; a folder that does not exist ends with exit code 1, an unknown option with 2.
`- The installer asks, on a page before its first one, whether to put the command on the PATH (ticked). A silent or passive install, and an update, do not ask: silent installs add it unless given \`/NOPATH\`, and an update leaves the PATH as it was. The PATH is changed by the command itself (\`--add-to-path\`, \`--remove-from-path\`), which reads and writes the registry value without expanding it, keeps its kind (\`REG_EXPAND_SZ\`), has no length limit, and tells running programs. The uninstaller takes the folder off again.
`- Tauri lets an installer hook add a page only before the wizard's first page, so the question comes first; a later ticket can move it with a custom NSIS template if that matters.
`- \`pnpm --filter @arden/desktop test:e2e:installer\` installs the built installer into a temporary folder, checks the command and the PATH, uninstalls, and puts the PATH back as it was; the trial release workflow runs it.
