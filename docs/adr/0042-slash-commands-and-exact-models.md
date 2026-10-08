# 0042. Slash commands, exact models and Ultrathink

- Status: Accepted
- Date: 2026-10-08
- Changes the model list of [0041](0041-choosing-how-a-session-starts.md), the "later" list of
  [0039](0039-working-with-claude.md), and plan sections 6.12 and 7.5.

## Context

Claude sessions had no menu of Claude Code's slash commands, only four model names (the latest of each family), and
icons in the message box that did not say what they chose. [The research](../research/claude-commands-and-models.md)
found that Claude Code already sends its slash commands and its models, with the effort levels each model takes, in the
answer to `initialize`, and pushes the commands again as plugins and skills load. [The councils](../research/slash-commands-and-models-councils.md)
weighed each choice.

## Decision

- **Slash command** is a term of its own (the glossary): "command" stays Arden Code's own action in the palette.
- **The list comes from Claude Code.** The driver keeps the latest commands and models Claude Code sent, from any of its
  Claude Codes, and one Claude Code started in the Playground, only to hear them and with no message sent, fills the list
  before a session has one. Arden Code does not read Claude Code's folders (ADR 0003).
- **The menu** opens when a Claude session's message starts with `/` and filters as Claude Code's own does. Names that
  start with `__`, internal workflow commands and commands bound to the terminal are left out.
- **Arden Code runs four commands itself:** `/model`, `/effort`, `/rename`, and `/clear` with its aliases `/reset` and
  `/new`. They change what the session holds; sent to Claude Code they would change only its running process. Everything
  else is sent as typed. A `conversation_reset` from Claude Code makes the driver carry on the new conversation, and the
  reply says a new conversation started.
- **The model is the value Claude Code lists** (an alias or a full id), never typed text, checked again before it is
  passed as an argument. This replaces ADR 0041's four names. Older models appear under "Older models". The sessions file
  needs no change: the column holds text, and the old aliases are valid values.
- **The effort menu follows the model:** the levels it supports; a model with none shows only Default and Ultrathink.
- **Ultrathink** is a switch in the effort menu that adds the word `ultrathink` to the next message, once. Nothing is
  saved. Ultracode is not offered.
- **The icons** say what they choose and are 16 px at the label's color.

## Consequences

- A new model needs no release of Arden Code, only an up-to-date Claude Code.
- The list Arden Code shows depends on the person's Claude Code version and account. Without Claude Code, or before the
  list has arrived, the menus offer Default and the four family aliases.
- One extra short-lived `claude` process runs per start of Arden Code, when Claude Code is installed.
