# 0041. Choosing how a session starts: agent, project, model and effort

- Status: Accepted
- Date: 2026-10-04
- Changes "no `--model`" in [0038](0038-claude-through-its-own-protocol.md), the welcome state and the "later" list of
  [0039](0039-working-with-claude.md), and plan sections 6.12 and 7.

## Context

The maintainer asked for three things at once: the welcome screen sends every first message to the Playground with no
way to choose; the model and the effort cannot be chosen; and the agent and project menus read as captions, not as
controls. [The councils](../research/session-choices-councils.md) weighed them (Q1 to Q6).

## Decision

- **The menus look like controls.** Agent, project, model and effort are outlined buttons in the message box's lower
  line, each with an icon, the choice and a chevron, named for what they choose ("Model: Opus"). The project menu lists
  the Playground, then folders by latest use, each with its path, then Open folder… with its shortcut. An agent whose
  agent CLI is missing is listed as Not installed and cannot be chosen.
- **The welcome screen chooses too.** Its message box has the same menus as an empty session. The project starts as the
  project of the latest session, else the Playground; the agent, model and effort as a new session there would take,
  until the person chooses. Sending asks to trust a folder before Claude first works there, as in a session. Claude may
  still work in the Playground.
- **Model.** Default, which passes no `--model` so Claude Code's own setting applies, or Fable, Opus, Sonnet or Haiku,
  passed as Claude Code's aliases (`--model opus`), which always mean the latest of each family. The aliases are Arden
  Code's own list, never typed text.
- **Effort.** Default, which passes no `--effort`, or Low, Medium, High, Extra high or Max (`--effort low` …
  `--effort max`).
- **They can change between messages.** Unlike the agent and project, the model and effort are not what a session is.
  Their menus stay after the first message and wait while a reply runs. The driver remembers what each Claude Code was
  started with; when the next message asks for something else, it ends that Claude Code and starts another with
  `--resume`, so the conversation carries on. Only the first reply after a change pays for the start.
- **New sessions inherit them** from the session the agent rule follows (that project's latest session, else the latest
  anywhere) when it has the same agent; a linked session from the session it was started from. Otherwise Default.
- They show only for Claude. The Demo agent has neither. The sessions file keeps them (version 4 and 5).

## Consequences

- A person who works on Opus at high effort keeps doing so without choosing it every time.
- Claude Code's own control request for changing the model was not used: it is not documented for effort, and a start
  with `--resume` covers both.
