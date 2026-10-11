# 0053. Plugins through the agent CLI

- Status: Accepted
- Date: 2026-10-11
- Changes the line on Claude Code's files in plan section 13 and [0042](0042-slash-commands-and-exact-models.md), and
  plan sections 5.8, 6.1 and 6.4; adds plan section 6.13.

## Context

The maintainer asked for plugins and skills to be managed in Arden Code, for every agent: one place to search for a
plugin, install it and manage it. Arden Code never reads or changes Claude Code's files (ADR 0003, ADR 0042).
[The research](../research/plugins-skills-and-mentions.md) found that:

- Claude Code manages its own plugins from the shell, with machine-readable results: `claude plugin install`,
  `uninstall`, `enable`, `disable` and `update` with `--json`, and `claude plugin list --json --available` for the
  installed plugins and every plugin the person's marketplaces offer (3,561 on the maintainer's machine).
- A running Claude Code loads a change with the `reload_plugins` control request, without a restart.
- Codex's app-server has the same operations (`plugin/search`, `plugin/install`, `marketplace/add`, `skills/list`).

[The councils](../research/plugins-and-mentions-councils.md) weighed each choice.

## Decision

- **Arden Code changes an agent's plugins only through the agent's own commands.** For Claude it runs the person's own
  `claude plugin … --json`, found and started as the driver starts Claude Code (ADR 0038), through the process
  supervisor (ADR 0028), one command at a time. Claude Code writes its own files; Arden Code writes none of them and
  copies no skills into any folder.
- **Untrusted text is checked before it is passed.** A plugin id is `name@marketplace`, of letters, digits, `.`, `_` and
  `-`, at most 128 characters. A marketplace source never starts with `-` and has no line break. Of Claude Code's
  answers Arden Code keeps only what it shows, and logs none of them: the installed list can hold an MCP server's
  environment.
- **A Plugins page,** like Settings: a sidebar row above Settings and a command in the palette, with no default
  shortcut. Its tabs are Discover (the catalog, searched by name and description), Installed (on or off, Update,
  Uninstall) and Marketplaces (Add, Update, Remove). Claude Code's scopes are offered in Arden Code's words; the two
  that belong to a project run only in a trusted folder project.
- **Before installing,** the person sees the plugin's source and a warning that a plugin can run programs through its
  hooks and servers. A command that a marketplace declares runs only after the person has read it in full, and only
  that command (`--accept-command`).
- **After a change,** every running Claude Code is sent `reload_plugins`, asking it to hold the reload when applying
  it would cost the conversation's prompt cache. A held session gets the change when its Claude Code next starts.
- **One design for every agent, one implementation for now.** The page and its contract name each plugin's agent and
  use the agent's own ids. Rust has only Claude's implementation; Codex's comes with its driver, and with it an
  interface the two share.
- **Not on the page:** a skill that is not in a plugin. Claude Code does not list them, and installing one means writing
  its folder. They still appear in the slash command menu. Many skill repositories are marketplaces, which the page
  can add.
- **Claude Code 2.1.268 or later** for the page, for the `--json` results. Sessions keep their minimum of 2.1.223.

## Consequences

- A plugin installed in Arden Code is the same plugin in the person's terminal, Claude's desktop app and VS Code, and
  the other way round.
- Arden Code depends on Claude Code's plugin commands and their `--json` results; the minimum version and parsing that
  ignores unknown fields guard it.
- Installing and refreshing reach the marketplace's host, such as GitHub, through Claude Code, at the person's action.
  Arden Code itself still sends nothing.
- Skills outside any plugin stay a later decision.
