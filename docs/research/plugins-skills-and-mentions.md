# Plugins, skills, file mentions and stacked slash commands: research

- Date: 2026-10-11
- Question: how can Arden Code let a person find, install and manage plugins and skills for its agents, without
  breaking ADR 0003; how does Claude Code take more than one slash command in a message; and how does an `@file`
  mention reach Claude Code over the driver's protocol (ADR 0038)?
- Read at: Claude Code 2.1.292 on the maintainer's machine, probed with the driver's flags and control requests only
  (no message, so no model turn and no API call); its `claude plugin` shell commands; the Agent SDK's published types
  (`@anthropic-ai/claude-agent-sdk` 0.3.294); the Claude Code docs; Codex's app-server protocol source on `main`; the
  Agent Skills specification; the `skills` CLI. All on the date above. Codex is not installed on this machine.

## The answer in short

- **Claude Code manages its own plugins from the shell, with machine-readable results.** `claude plugin install`,
  `uninstall`, `enable`, `disable` and `update` take `--json` and print one result object on the last line of stdout.
  `claude plugin list --json --available` lists the installed plugins and every plugin the person's marketplaces
  offer. Arden Code can drive Claude's plugins this way without reading or writing Claude Code's files. [CLI] [PROBE]
- **A running Claude Code takes a new plugin without a restart.** The `reload_plugins` control request reloads plugins
  from disk and answers with the new slash commands. [TS] [PROBE]
- **Several skills at the start of one message already run.** Claude Code expands the first skill and up to five more
  stacked after it. A slash name after plain text runs nothing; it only gives Claude permission to use that skill.
  Arden Code sends the text as typed, so only the menu is missing. [SKILLS]
- **`@path` is Claude Code's own feature on this protocol.** A user message gets Claude Code's `@path` file-mention
  expansion unless it is marked `client_composed`. The `file_suggestions` control request returns the same fuzzy
  matches as Claude Code's terminal menu. [TS] [PROBE]
- **Codex has plugins, marketplaces and skills too,** with app-server methods for each, and a fuzzy file search. A
  Codex adapter can sit behind the same seam later. [CODEX]
- **Skills outside any marketplace** follow the Agent Skills open standard: a folder with a `SKILL.md`. Claude Code
  reads them from `.claude/skills`; Codex reads them from `.agents/skills`. [SKILLS] [SPEC] [VSKILLS]

## Claude Code's plugins

### What a plugin is

- A plugin adds skills, agents, hooks, and MCP and LSP servers to Claude Code. It comes from a **marketplace**, a
  catalog of plugins: a GitHub repository, any git repository, a local folder, or a hosted `marketplace.json`.
  [DISCOVER]
- Anthropic's official marketplace is `claude-plugins-official`. Claude Code adds it the first time the person opens an
  interactive terminal session; on a machine where nobody has, `claude plugin marketplace add
  anthropics/claude-plugins-official` adds it. [DISCOVER]
- A plugin's id is `name@marketplace`. Its skills are slash commands named `/<plugin>:<skill>`. [DISCOVER]
- Plugins the person turns on in their claude.ai account sync into Claude Code as `name@synced`. They are removed on
  claude.ai, not in Claude Code. [DISCOVER]

### Scopes

- **User:** every project on this machine; recorded in `~/.claude/settings.json`.
- **Project:** everyone who works in the repository; recorded in the project's `.claude/settings.json`, **a file the
  person commits**. Each collaborator still installs it once.
- **Local:** this person, this repository only; recorded in `.claude/settings.local.json`.
- Local overrides project, and project overrides user. [DISCOVER]

### The shell commands

`claude plugin` (alias `claude plugins`), exit `0` on success and `1` on failure. [CLI]

| Command | What it does | `--json` |
|---|---|---|
| `install <id>` | Installs from a marketplace, with its dependencies, at `--scope user` (default), `project` or `local`. `--marketplace <source>` adds the marketplace first (2.1.292 or later). | 2.1.268 or later |
| `uninstall <id>` | Removes it from one scope; from the last one, also its saved options, secrets and data folder. | 2.1.268 or later |
| `enable <id>` / `disable <id>` | Turns it on or off at the most specific scope that lists it. | 2.1.268 or later |
| `update <id>` | Updates to the marketplace's latest version, loaded at the next start or reload. | 2.1.268 or later |
| `list` | The installed plugins; with `--available`, also the marketplaces' others. | yes |
| `details <id>` | What an installed plugin adds, and its token cost on every turn. | (not checked) |
| `marketplace add / list / update / remove` | Manages marketplaces. Removing one uninstalls its plugins. | yes |

- **The result object** of install, uninstall, enable, disable and update always has `command`, `outcome` (`ok` or
  `failed`) and `message`, and sometimes `pluginId`, `scope` and `failureCode` (such as `already_in_goal_state` and
  `settings_still_on`). Parse only the last line of stdout. [CLI]
- **The installed list** has, per installation, `id`, `version`, `scope`, `enabled` and `installPath`, and when they
  apply `installedAt`, `lastUpdated`, `projectPath`, `mcpServers`, `errors`, `notes` and `hasUserConfig`. The scope is
  `user`, `project`, `local` or `managed` for installs, `user` or `project` for a skill folder loaded as a plugin,
  `session` for `--plugin-dir`, and `synced` for claude.ai's. [CLI]
- **The available list** has, per plugin, `pluginId`, `name`, `marketplaceName`, `source`, `description`, `version` and
  `installCount`. On this machine, signed in, with only the official marketplace added, it held 3,561 plugins and no
  installed ones; the first was `42crunch-api-security-testing@claude-plugins-official` with an `installCount` of
  3,448. [PROBE]
- **Commands a marketplace declares.** Some plugins install by running a command their marketplace names. With
  `--json`, the run does not execute it: the `failed` result carries `shownCommand` with the command and its
  `sha256`. Running again with `--accept-command <sha256>` accepts exactly that command, and nothing else. The flag
  "has no effect inside a Claude Code session", which Arden Code is not. [CLI]
- **Under `-p`, `/plugin` does not run.** Claude replies `/plugin isn't available in this environment.` Plugins already
  installed do load. [DISCOVER]

### After an install

- Plugins installed from the shell load "the next time you start Claude Code, or when you run `/reload-plugins` in a
  session that's already open". [DISCOVER]
- **`reload_plugins`** is a control request on the driver's pipes. Its answer holds `commands`, `agents`, `plugins`
  (name, path, source, version), `mcpServers` and `error_count`. With `hold_on_cache_impact: true`, Claude Code first
  checks whether applying would change the tools the conversation's prompt cache depends on; if so it applies nothing
  and answers `held: true` with `cache_impact`, and the client may ask again without the option. [TS]
- In the probe, `reload_plugins` with `hold_on_cache_impact` answered `held: false`, 0 errors, 50 commands and two
  built-in plugins. [PROBE]
- `reload_skills` reloads skills only and answers with their slash commands. [TS]

### Trust

- A plugin can run hooks and MCP servers: "read the pane before you install". Claude Code's own install panel shows
  what the plugin adds and, for the official marketplace, its context cost. [DISCOVER]

## Skills

- **Claude Code skills follow the Agent Skills open standard.** A skill is a folder with a `SKILL.md`: YAML front
  matter (`name`, `description`, and optional fields), then Markdown instructions. [SKILLS] [SPEC]
- **Where Claude Code reads them:** `~/.claude/skills/<name>/` (personal), `.claude/skills/<name>/` in a project,
  inside a plugin as `/<plugin>:<skill>`, and from the claude.ai account. The old `.claude/commands/*.md` files still
  work as skills. [SKILLS]
- **A skill folder can be a plugin.** With a `.claude-plugin/plugin.json` beside its `SKILL.md`, it loads as
  `<name>@skills-dir` and can bring agents, hooks and MCP servers. `claude plugin init <name>` scaffolds one in
  `~/.claude/skills/<name>/`. [SKILLS] [PROBE]
- **The `skills` CLI** (vercel-labs, MIT) installs skills from GitHub, other git hosts or local paths into many agents'
  folders: `.claude/skills/` or `~/.claude/skills/` for Claude Code, `.agents/skills/` or `~/.agents/skills/` for Codex.
  It links each agent's folder to one copy, or copies. It also reads `.claude-plugin/` manifests. [VSKILLS]
- **skills.sh** answers `GET /api/search?q=<text>` with JSON: each skill's id, source repository, name and install
  count. The endpoint is not documented. [PROBE]

## Slash commands in one message

- **At the start:** `/deploy staging` runs the skill. [SKILLS]
- **Stacked at the start:** `/write-tests /fix-issue 123` loads both skills and passes `123` to each. Claude Code
  expands the first skill and up to five more. "Expansion stops at the first token that isn't an inline
  user-invocable skill", such as a skill that runs as a forked subagent (`/code-review` from 2.1.218) or `/loop`; that
  token and the rest become every skill's arguments. The page states no minimum version. [SKILLS]
- **After plain text:** `go ahead and /deploy to staging` runs nothing directly. "The name counts as your permission
  for that message": Claude may run the skill while it answers. [SKILLS]
- Arden Code sends a message's text as typed (`claude/protocol.rs`), so stacked skills reach Claude Code as typed. By
  the documentation, not tried in the app.
- Arden Code runs `/model`, `/effort`, `/rename` and `/clear` itself when a message is exactly one of them (ADR 0042).
  They are built-in commands, not skills, so they never stack.

## File mentions

- **Expansion is Claude Code's own.** A user message carries `client_composed: true` only when the client built it
  from text the person did not type; then Claude Code delivers it "with no `@path` file-mention expansion and no
  slash-command dispatch". Without the flag, both happen, as the driver sends messages today. [TS]
- **`file_suggestions`** is a control request: "at-mention file autocomplete suggestions for a partial path prefix.
  Returns the same fuzzy-matched results the TUI shows." [TS]
- **In the probe,** in this repository: [PROBE]
  - The answer is `{ "suggestions": [{ "path": … }], "cwd": … }`, at most 15 paths, relative to the folder Claude Code
    runs in.
  - An empty query lists the top of the folder. A folder ends with `\`.
  - `glos` found `GLOSSARY.md` first, then fuzzy matches elsewhere in the tree. `docs/adr/004` listed the ADRs whose
    numbers start with `004`. `apps/desktop/src/features/` listed that folder's children.
  - Paths inside the tree use `/`; only the folder's own trailing separator is `\`.
  - It answered within half a second of being asked, with no message sent.
- **Claude Code's settings** shape the list: `respectGitignore` (on by default) and `fileSuggestion`, a command of the
  person's own that replaces the search. [TS]
- **Before a session has a Claude Code,** nothing can answer `file_suggestions` in that project: the driver starts one
  `claude` per session at its first message, and one in the Playground at start (ADR 0038, ADR 0042).
- Claude Code also expands `@server:resource` MCP mentions. [TS]

## Codex

Codex has no driver in Arden Code yet; this section only sizes the seam.

- **Plugins** came to Codex on 2026-03-26. A plugin bundles skills, MCP servers and more, and comes from a marketplace;
  in Codex CLI, `/plugins` opens a browser. A newly installed plugin needs a new session. In Codex, an `@` mention
  invokes a plugin or one of its skills. [CPLUG]
- **The app-server protocol** (the one Arden Code plans to use for Codex, ADR 0017) has `plugin/list`,
  `plugin/search`, `plugin/install`, `plugin/uninstall`, `plugin/installed`, `plugin/read`, `marketplace/add`,
  `marketplace/remove`, `marketplace/upgrade`, `skills/list`, a `skills/changed` notification, and the
  `fuzzyFileSearch` methods. [CODEX]
- **Skills** for Codex live in `.agents/skills/` and `~/.agents/skills/`. [VSKILLS]

## Sources

- [PROBE] Claude Code 2.1.292, installed with winget, on the maintainer's machine, 2026-10-11:
  - started in this repository with the driver's flags (`-p --input-format stream-json --output-format stream-json
    --verbose --permission-prompt-tool stdio --permission-mode default`) and an environment without `CLAUDECODE` and
    the `CLAUDE_CODE_*` variables; it was sent `initialize`, four `file_suggestions` requests and one `reload_plugins`
    request with `hold_on_cache_impact`, and no message;
  - `claude plugin --help` and the help of its subcommands, `claude plugin marketplace list --json`, and
    `claude plugin list --available --json`;
  - `curl https://skills.sh/api/search?q=pdf`.
- [TS] `@anthropic-ai/claude-agent-sdk` 0.3.294, `sdk.d.ts`:
  <https://cdn.jsdelivr.net/npm/@anthropic-ai/claude-agent-sdk@0.3.294/sdk.d.ts> (`SDKControlReloadPluginsRequest`,
  `SDKControlReloadPluginsResponse`, `SDKControlReloadSkillsRequest`, `SDKControlFileSuggestionsRequest`,
  `client_composed`, `fileSuggestion`, `respectGitignore`).
- [DISCOVER] Install and manage plugins: <https://code.claude.com/docs/en/discover-plugins>.
- [CLI] Plugin commands reference: <https://code.claude.com/docs/en/plugins/cli-reference>.
- [SKILLS] Extend Claude with skills: <https://code.claude.com/docs/en/skills>, sections "Choose where skills load",
  "Where you write the skill's name" and "Pass arguments to skills".
- [SPEC] Agent Skills specification: <https://agentskills.io/specification>.
- [VSKILLS] The `skills` CLI: <https://github.com/vercel-labs/skills>.
- [CODEX] Codex app-server protocol, `codex-rs/app-server-protocol/src/protocol/common.rs` on `main`:
  <https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs>.
- [CPLUG] Codex plugins: <https://learn.chatgpt.com/docs/plugins> (redirected from
  <https://developers.openai.com/codex/plugins>).
