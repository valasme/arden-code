# 0052. Several slash commands and file mentions in a message

- Status: Accepted
- Date: 2026-10-11
- Changes the slash command menu of [0042](0042-slash-commands-and-exact-models.md), and plan section 6.12.

## Context

The maintainer asked for several slash commands in one message, and for `@file.md` in the message box. The message
box's menu opened only while the whole message was one `/word`. [The research](../research/plugins-skills-and-mentions.md)
found that Claude Code already does both:

- It runs the first skill at the start of a message and up to five more stacked after it, and a slash name after plain
  text gives Claude permission to use that skill.
- It expands `@path` (and `@"path with spaces"`) in every message the driver sends, reading the file with the message.

What was missing is help in the message box. [The councils](../research/plugins-and-mentions-councils.md) weighed each
choice.

## Decision

- **One list, at the word under the cursor.** It opens while the cursor ends a word that starts with `/` or `@`, at
  the start of the message or after a space or line break, and sits above the box as the slash command list did.
  Arrows move, Tab fills in, Esc closes and keeps the text. It never sends while it is open, except as before for a
  command with no arguments chosen as the message's first word.
- **Slash commands past the first word.** The first word lists every slash command, as before. A later word lists only
  skills: not Claude Code's built-in commands, which neither stack nor run after text, and not MCP prompts. The four
  commands Arden Code runs itself (ADR 0042) are unchanged.
- **File mentions.** `@` lists the files and folders of the session's project, or of the welcome state's chosen
  project, matched by the typed letters. Choosing one fills in its path relative to the project, with `/`, quoted as
  `@"…"` when it holds a space; a folder fills in `@folder/` and keeps the list open on its contents. Every agent has it;
  the agent decides what the text means.
- **Arden Code lists the files itself, in Rust.** Claude Code's own `file_suggestions` needs a Claude Code running in
  the project, and starting one before the person trusts the project would run its hooks and servers (ADR 0039). The
  listing leaves out what `.gitignore` and `.ignore` leave out and the `.git` folder, holds at most 100,000 entries, is
  made again when the list opens and it is more than 10 seconds old, and returns at most 15 matches. Nothing watches
  the folder.
- **Plain text.** The box stays a text area: no chips and no colour, so composition, spellcheck, screen readers and
  drafts (ADR 0046) keep working as they do.
- **Later:** attachments (a pasted screenshot, a file dropped from File Explorer, a file outside the project), colour
  for the recognised words, and line ranges and MCP resources in the list.

## Consequences

- Stacked skills and file mentions work as in Claude Code's terminal, with no change to what the driver sends.
- Arden Code reads the names of the files in a person's project, never their contents and never Claude Code's files.
  The list can differ from the terminal's when the person changed Claude Code's `respectGitignore` or `fileSuggestion`
  settings; a path typed by hand still works.
- The list may offer a skill that does not stack, such as one that runs as a subagent; Claude Code then takes the rest
  of the message as its arguments.
