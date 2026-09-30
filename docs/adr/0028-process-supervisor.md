`# 0028. The process supervisor and agent detection
`
`- Status: Accepted
`- Date: 2026-09-30
`
`## Context
`
`Agents are programs that Arden Code does not control: the person's own `claude` and `codex`. They are started with text from the person and from other agents, and on Windows the way a program is started decides whether that text is data or commands (ADR 0017, ADR 0020).
`
`## Decision
`
`- **One crate starts every program** (`arden-process`), so the rules below cannot be forgotten in a new place.
`- **Finding a program**: only the folders of `PATH` are searched, and only absolute ones, never the current folder (a project could hold a program that takes the place of the installed one). A real `.exe` (or `.com`) wins over a `.cmd` or `.bat` wrapper, even one in an earlier folder. Script hosts such as `.vbs` and `.js`, though `PATHEXT` lists them, are never started. A name that is a path is not resolved.
`- **Arguments**: an argument is either a literal written in Arden Code's source (`&'static str`) or untrusted text. A `.cmd` or `.bat` script, which `cmd.exe` reads as commands, only gets literals; untrusted text for a script is refused before anything starts. Real programs get any text, one argument each.
`- **The job**: every child is put in one Windows Job Object that ends its processes when it is closed, which Windows does when Arden Code ends however it ends, also when it is ended from Task Manager. A child that cannot be put in the job is ended and reported, because a child outside the job would outlive the app. Programs the child starts belong to the job too. Tests end the supervisor and the whole app, and check that the children are gone.
`- **A log for each child**: everything a child writes (output and errors) goes to a file of its own in `logs/agents`, named after the program, the time and a counter. The first line says what was started, and never holds text that came from a person or an agent. These logs are not part of the diagnostics bundle unless the person adds them.
`- **Detection only looks.** It finds \`claude\` and \`codex\`, asks each for its version with the literal argument \`--version\` (10 seconds at most, ended after that), and reports whether it is installed, where, and which version. It never installs, updates, signs in or reads credentials. Settings → Agents shows the result, with a link to each program's install page and a button to look again.
`
`## Consequences
`
`- Without Windows (never shipped) the job does nothing.
`- A new kind of argument (a file path an agent chose) is untrusted until it is judged, and reaches scripts never.
