# Plugins, stacked slash commands and file mentions: the councils

- Date: 2026-10-11
- Input: the maintainer's three requests (below), [the research](plugins-skills-and-mentions.md), ADRs 0003, 0028,
  0038, 0039, 0042, 0045 and 0046, and the codebase at `603a524`.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides, by the same
  25 roles: product (P), experience (E), architecture (A), reliability (R) and delivery (D). Where a role objected, the
  objection is kept with what settled it. The maintainer asked for the council workflow, so each question has a
  verdict. The first round of the interview (`/grill-with-docs`) had a recommendation for each question; it was weighed
  as the first option, and two were changed (Q2 and Q5).

## The requests

1. Plugins and skills managed by Arden Code rather than inside Claude Code: one place, for every agent, to search for a
   plugin or skill, install it and manage it. "How would it work with Claude?"
2. Several slash commands in one message.
3. `@file.md` in the message box, to attach the files a person wants.

## Round 1

### Q1. How the work is split

- **Product:** P5 the three requests are two pieces of work: the message box (requests 2 and 3) and plugins (request
  1). **P2 dissents** on the order: plugins is what the maintainer asked about most. Settled: neither waits on the
  other; the message box is small and needs no new process work, and the plugins work starts with a prototype the
  maintainer has to look at anyway.
- **Architecture:** A4 requests 2 and 3 share one mechanism, a menu at the word under the cursor. Plugins share nothing
  with them, except that an install changes the slash commands, which already reach the menu.
- **Delivery:** D1 one spec each, with its own tickets. D2 one branch and pull request each: two smaller pull requests
  keep `main` green more easily than one. The documents land first, in a pull request of their own, so both branches
  start from the same decisions.

**Verdict:** two specs, the message box first, the documents before both.

### Q2. What "universal" means

Options: **A** one design for every agent, built for Claude now, with Codex added when its driver exists; **B** Claude
and Codex now; **C** a library of Arden Code's own that copies skills into each agent's folder, as the `skills` CLI
does.

- **Product:** P1 the point is one place for every agent. P4 Claude's desktop app and VS Code extension manage only
  Claude's plugins, and Codex's app only Codex's; one page for both is Arden Code's own.
- **Architecture:** A5 Codex's app-server already has `plugin/search`, `plugin/install`, `plugin/uninstall`,
  `marketplace/add` and `skills/list`, and names plugins `name@marketplace` as Claude Code does, so one model fits
  both. **A3 dissents** to an agent-neutral interface in Rust now: one adapter is a hypothetical seam, and an interface
  shaped by Claude alone would be reshaped when Codex arrives. Settled: the words and the contract with the page are
  agent-neutral (each plugin row names its agent, and the ids are the agent's own), but Rust has one Claude
  implementation and no trait until the Codex driver brings the second.
- **Reliability:** B cannot be built: there is no Codex driver, and Codex is not installed on the maintainer's
  machine. C: R2 a second copy of the person's skills would race Claude Code's own auto-updates; R3 it means writing
  Claude Code's folders (Q3).
- **Delivery:** D5 C duplicates the `skills` CLI and keeps its ten agents' folder layouts current by hand.

**Verdict: A**, with the seam made real when Codex arrives.

### Q3. Who changes the agent's files

Options: **A** Arden Code runs the agent's own commands (`claude plugin install … --json`) and the agent changes its
own files; **B** Arden Code writes skill folders and settings itself.

- **Product:** P1 plan section 13 and ADR 0042 say Arden Code never reads or changes Claude Code's files. With A that
  stays true. P2 a plugin installed in Arden Code is the same plugin in the terminal, the desktop app and VS Code,
  because they read the same settings files.
- **Architecture:** A3 Claude Code's commands are documented, take `--json` and print one result object; the installed
  list and the catalog come from `claude plugin list --json --available`. B would make Arden Code a second writer of
  `settings.json` and of the plugin cache.
- **Reliability:** R3 the arguments are untrusted text: a plugin id from the catalog, a marketplace source the person
  typed. A plugin id is checked before it is passed: letters, digits, `.`, `_` and `-` on each side of one `@`, 128
  characters at most. A source never starts with `-`, so it cannot be read as a flag, and has no line break. Claude
  Code is started as the driver starts it (ADR 0038), through the process supervisor and its job (ADR 0028), never
  through a `.cmd`. **R3 dissents** on reading the installed list at all: its `mcpServers` field can hold a server's
  environment, tokens included. Settled: Arden Code keeps only the fields it shows, drops the rest while parsing, and
  never logs the output. R5 one plugin command at a time, in order: Claude Code writes settings files, and two writers
  at once could lose a change.
- **Delivery:** D3 these are Claude Code's own documented commands, run at the person's action: ordinary use. D5 the
  `--json` results need Claude Code 2.1.268. Sessions keep their minimum of 2.1.223; below 2.1.268 the Plugins page asks
  for `claude update`.

**Verdict: A.** A new ADR. Plan section 13 gains a sentence saying how plugins change.

### Q4. The words

- **Architecture:** A1 three terms: **Plugin**, **Skill** and **Marketplace**. The glossary's Slash command already
  says slash commands come from "skills, plugins or MCP servers"; a skill is what runs, the slash command how it is
  run. Claude Code's install scopes are its own and get no term: the page says them in plain words (Q11).
- **Experience:** E5 the page is **Plugins**, and its tabs are Discover, Installed and Marketplaces, as in Claude Code's
  own `/plugin` panel, so a person who knows the terminal finds the same words (P4). **E5 dissents**, with P2: the
  maintainer said "skills / plugins", and a page called Plugins could hide skills. Settled: the page's line under its
  title says what plugins bring, skills first; Claude Code lists skills under their plugins; and a skill on its own is
  a different case (Q18).

**Verdict:** the three terms, and the page is Plugins.

### Q5. Where it lives

Options: **A** a full page, like Settings; **B** a tab of Settings; **C** a dialog from the message box.

- **Experience:** E1 A, with Settings' pattern (plan section 6.3): while the page is open, the sidebar shows Back, the
  page's search and its tabs. C is too small for 3,561 plugins and their details. E2 a sidebar row, Plugins, above
  Settings, with Lucide's blocks icon. **E4 dissents** on the recommended shortcut, Ctrl+Shift+X (VS Code's): plan
  section 6.4 refuses Ctrl with a key that edits text, and `checkShortcut` refuses X. Settled: no default shortcut,
  like Pin and Archive; Plugins is a command in the palette's Go to group and can be bound.
- **Architecture:** A1 B is wrong: a setting is "a user preference that Arden Code stores", and plugins are the agent's.
- **Delivery:** D1 the riskiest part to get right by eye is a plugin's details and the install choices (Q11 to Q14).
  A `/prototype` with three variants on the real route, with stub data, comes first, and the maintainer picks. **P5
  dissents**: the Settings rows already answer the list. Settled: the prototype covers only the details and the install
  choices, and is kept on a `prototype/plugins-page` branch.

**Verdict: A**, no default shortcut, the prototype first.

### Q6. The slash command menu past the first word

- **Product:** P2 stacking is Claude Code's documented way to run several skills, and a skill named after text is
  permission to use it; the menu should help wherever a slash starts a word.
- **Experience:** E1 the menu opens while the cursor is at the end of a word that starts with `/`, at the start of the
  message or after a space or line break. On the first word it lists every slash command, as now; on a later word it
  lists only skills: those of plugins and the person's own, not Claude Code's built-in commands (they neither stack nor
  run after text) and not MCP prompts. On a later word, Enter fills the command in and never sends; Tab fills in
  everywhere; Esc closes the list and keeps the text. A filled-in command ends with a space. E3 the list stays above the
  box, with its roles and announcements.
- **Architecture:** A3 no new data: `builtin` and the `(MCP)` ending already tell the kinds apart. **A1 dissents**:
  Arden Code cannot tell a skill that stacks from one that runs as a forked subagent, which ends the stack, so the menu
  may offer `/code-review` second. Settled: Claude Code then passes the rest as that skill's arguments, as documented,
  and the text reaches it as typed; nothing breaks.
- **Reliability:** R1 the word under the cursor is a pure function of the text and the cursor, tested on its own; the
  message box's tests cover the keys; the end-to-end test of the menu runs 10 times.
- **Delivery:** D5 the four commands Arden Code runs itself are unchanged: only a message that is exactly one of them.

**Verdict:** as above.

### Q7. Plain text or chips

- **Experience:** E2 would like the recognised words in colour, as Claude's desktop app shows slash commands. **E3
  dissents** to a rich editor: NVDA and Narrator read a text area well and an editable region poorly, and composition
  (plan section 9) and spellcheck belong to the text area.
- **Architecture:** A4 a draft is text (ADR 0046).
- **Reliability:** R1 the message box's tests rely on the text area.

**Verdict:** plain text. Colour drawn in a layer behind the text area, which keeps it a text area, is a later piece of
work.

### Q8. Where the file list comes from

Options: **A** Claude Code's `file_suggestions`, the same matches as its terminal; **B** Arden Code lists the project's
files itself, in Rust.

- **Reliability:** R3 decides it. Rust refuses to start Claude in an untrusted project (ADR 0039), and the welcome
  state and an empty session have no Claude Code in their project. Starting one only for suggestions would run the
  project's hooks and servers before the person trusts it. R4 the names are listed on a background thread when the list
  first opens in a project, leaving out what `.gitignore` and `.ignore` leave out and the `.git` folder, at most 100,000
  entries; they are listed again when the list opens and the last listing is more than 10 seconds old. Nothing watches
  the folder (plan section 11: no polling). Matching runs in Rust and returns at most 15 paths, as Claude Code's does.
- **Architecture:** A5 B serves Codex and the Demo agent too.
- **Product:** **P2 dissents**: the terminal's list follows the person's `respectGitignore` and `fileSuggestion`
  settings, which Arden Code does not read. Settled: rare, and a path typed by hand still works, since Claude Code
  expands any `@path`.

**Verdict: B.**

### Q9. What `@` covers, and its name

- **Experience:** E1 `@` at the start of a word opens the list of the project's files and folders, matched by the
  typed letters (`glos` finds `GLOSSARY.md`). Tab or Enter fills in the path relative to the project, with `/`; a folder
  fills in `@folder/` and keeps the list open on what is in it. A path with a space is written `@"path with
  space"`: Claude Code 2.1.292 reads the quoted form first, and its own menu writes it. Enter never sends while the list
  is open.
- **Architecture:** A1 the term is **File mention**. Pasting a screenshot, dropping a file from File Explorer or
  naming a file outside the project need the file itself sent with the message: **attachments**, a later piece of
  work (ADR 0039 already lists them as later). A5 in Codex, `@` names a plugin; the Codex driver decides how its file
  mentions are written.
- **Reliability:** R3 nothing new leaves the machine: the file reaches the vendor because Claude Code reads it, as when
  the person types the path.
- **Product:** P5 every session with a project has the list, the Demo agent's too (it sees the text), and the welcome
  state in its chosen project.

**Verdict:** file mentions of the project's files and folders now; attachments later.

## Round 2: plugins

| # | Question | Verdict and why |
|---|---|---|
| 10 | The catalog | R4 `claude plugin list --json --available` took 1.5 s and printed 2.1 MB for 3,561 plugins. Rust reads it when the Plugins page first opens in a run of Arden Code, keeps it in memory, and reads it again after a change and on Refresh. The page gets only the fields it shows; it searches name and description itself and lists by install count, then name, in a virtualized list. Only 312 plugins carry an install count, so the rest follow by name. |
| 11 | Install scopes | E5 Install offers Claude Code's three scopes in Arden Code's words: For you, in every project (user, the default); For you, in this project (local); For everyone in this project (project), which says it changes the project's `.claude/settings.json`, a file the project shares. A1 the two project choices take a folder project from a menu, the open session's first; the Playground is not offered. |
| 12 | Trust before a project install | R3 Claude Code reads a project's settings when it runs in it. An install for a project, and any change to one, runs only in a trusted project; the trust question comes first, as for a message (ADR 0039). User installs run in the Playground. |
| 13 | What the details show | R3, D3 the name, marketplace, description, version, install count, source (the repository or path, as text), and a line: a plugin can run programs on this computer through its hooks and servers, so install only plugins you trust. No badge of approval. |
| 14 | Commands a marketplace declares | R3 a `failed` result with `shownCommand` opens a confirmation that shows the command in full, in the code font. Its first button re-runs the install with `--accept-command <sha256>`; Cancel leaves nothing installed. Never `--yes`. |
| 15 | Sessions already running | R5, A3 after a change, every running Claude Code, the catalog's one in the Playground included, is sent `reload_plugins` with `hold_on_cache_impact`. The answer's slash commands replace the list. P1 a held reload is left as it is: applying it would cost an uncached request the person did not ask for. That session gets the change when its Claude Code next starts, and the result says so. |
| 16 | The Installed tab | P2, E5 every row of `claude plugin list --json`, with its scope (and project), version, an on/off switch, Update and Uninstall, and its load errors. A plugin synced from claude.ai can be turned off but not uninstalled ("Remove it on claude.ai"); one from the person's organization shows no actions. A refusal shows Claude Code's own message. |
| 17 | The Marketplaces tab | P2, P3 the list, Add (a GitHub `owner/repo`, a git address, a local folder or a `marketplace.json` address), Update, and Remove, whose confirmation says how many plugins it uninstalls. When Anthropic's official marketplace is missing, Discover offers to add it. Many skill repositories are already marketplaces, so Add reaches them. |
| 18 | A skill on its own | A1, R3, P5 the Plugins page neither lists nor installs a skill that is not in a plugin: Claude Code's list does not report them, and installing one means writing a `.claude/skills` folder (Q3). They still appear in the slash command menu. Installing skills from skills.sh or any repository is a later question with its own decision. |
| 19 | Running the commands | R3, R5, D4 the same `claude` and environment as the driver; the project's folder for project and local scope, the Playground's otherwise; one at a time; ended and reported after 5 minutes; its error output goes to the child's log; its standard output is parsed and never logged. |
| 20 | Versions | D5, P3 without Claude Code, the page says how to install it, as Settings → Agents does; below 2.1.268, it asks for `claude update`. |
| 21 | Network and privacy | R3, P1 Arden Code itself sends nothing. Opening the page, installing, updating and adding a marketplace are the person's actions; Claude Code then reaches the marketplace's host, such as GitHub, with its own settings. Nothing runs in the background. Plan section 13 and `PRIVACY.md` say so. |
| 22 | Error codes | D4 new `ARD-AGT` codes: plugins need a newer Claude Code; a plugin command failed (with Claude Code's message); one answered in a way Arden Code does not understand; one took too long. |
| 23 | Accessibility | E3 the list is a list of named rows; results are announced politely; Install opens a dialog that holds the focus; everything works by keyboard. |
| 24 | Codex | A5 with the Codex driver, through `plugin/*`, `marketplace/*` and `skills/list`; the page then shows each plugin's agent and a choice of agent. |

## Round 3: the message box

| # | Question | Verdict and why |
|---|---|---|
| 25 | One list or two | A4, E3 one list above the box for slash commands and files, with the same keys and polite counts ("3 files", "No matching files"). |
| 26 | Line ranges and MCP resources | P5 the list offers neither `@file#L10-20` nor `@server:resource`; typed by hand, both reach Claude Code. |
| 27 | Ultrathink | R2 unchanged: a message that starts with a slash is not given the word (ADR 0042). |

## Round 4: documents, branches and tickets

| # | Question | Verdict and why |
|---|---|---|
| 28 | The documents | D1, D2 the research, this record, ADR 0052 (the message box), ADR 0053 (plugins), the glossary (Plugin, Skill, Marketplace, File mention), the plan (sections 5.8, 6.1, 6.4, 6.12, a new 6.13 and 13), the vendors page and `PRIVACY.md`: one commit and one pull request, merged first. |
| 29 | Specs and tickets | D1 two specs on the tracker, each split into vertical tickets with blocking edges, the plugins prototype first. One branch and pull request per spec, a commit and an issue per ticket. R1 every new or changed end-to-end or screenshot test runs 10 times before the merge. |

## Round 5: the prototype's pick (#146)

The maintainer handed the pick to the councils. The prototype is kept on the `prototype/plugins-page` branch
(`pnpm prototype:plugins`, then `?variant=A|B|C`): three variants of a plugin's details and the install choices, with
stub data shaped like `claude plugin list --json --available`.

- **A:** a list and a details pane side by side; Install… opens a dialog with the three scopes as radio buttons, the
  project menu under the two project scopes, and the warning; a marketplace's command is a confirmation of its own.
- **B:** one list whose rows open in place, with the details, the scopes as joined buttons, the project menu and the
  warning inline; a marketplace's command is confirmed inside the row.
- **C:** a table, and a page per plugin with its details in a column and an install panel in numbered steps beside them;
  the marketplace's command shows on the page before Install.

### Q30. Which variant is built

- **Product:** P2 a person browsing 3,561 plugins compares them; A keeps the list in view while the details change, B
  makes them open and close one row at a time, and C leaves the list for every plugin. P5 C reads best for one plugin
  the person already knows.
- **Experience:** E3 Q23 already said Install opens a dialog that holds the focus: A and C's confirmations do, B's
  inline form does not, and an inline command block is easier to scroll past than a dialog that must be answered.
  **E1 dissents** for B: it is Settings' column, and Installed and Marketplaces will be rows. Settled: those tabs keep
  rows; Discover alone gets the pane, because it is where plugins are compared. E4 at Arden Code's smallest window
  (500 px, ADR 0047) two panes do not fit; below the width of both, the details take the list's place with a Back
  button, as C does.
- **Architecture:** A2 the list is virtualized (Q10); rows of one height, as in A and C, virtualize simply, while B's
  rows that open in place change height. A4 the scope choice is the same component in the dialog whichever tab opens
  it later.
- **Reliability:** R3 C shows a marketplace's command before Install, but Claude Code tells it only in the answer to an
  install (`shownCommand` in a `failed` result, Q14); the catalog does not hold it. C's layout promises what Arden Code
  cannot know. R1 a dialog is the existing pattern for the trust question (ADR 0039), so both questions behave alike.
- **Delivery:** D1 A is the least new code: a list, a pane, one dialog, and the trust and command confirmations as
  alert dialogs.

**Verdict: A**, with the details taking the list's place below the width of both panes. From B: each scope keeps its
line saying who gets it. From C: nothing; its pre-shown command is not available.
