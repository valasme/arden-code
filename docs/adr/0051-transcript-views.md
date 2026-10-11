# 0051. Transcript views

- Status: Accepted
- Date: 2026-10-11
- Changes how a session view draws thinking and tool calls ([0032](0032-the-redesign.md)), and adds a setting to plan
  section 6.3.

## Context

The maintainer asked for a choice of transcript view (#133), as Claude's own desktop app has: Normal, Thinking and
Verbose. There, a setting picks the view sessions open in, and a session's Transcript view menu changes only that
session.

The session view drew every reply the same way: the agent's thinking folded under one line, and each tool call as a line
with its input cut to fit and, under it, all of what the tool answered. Long tool output made a reply hard to follow,
and there was no way to see everything at once.

## Decision

- **Three views,** from the least shown to the most:
  - **Normal**, the default: the reply's text, approvals, questions, plans, file changes and status lines, with the
    thinking folded under its line and each tool call one line, what the tool answered folded under it. A folded line
    opens with a click, as before.
  - **Thinking**: the same, with the thinking open.
  - **Verbose**: everything open, and each tool call's input in full instead of cut to one line.
- **The default is a setting,** Settings → Appearance → Default transcript view: Normal, Thinking or Verbose
  (`appearance.transcriptView`).
- **A session's menu has a Transcript view submenu,** in its header and on its row in the sidebar, which changes the view
  of that session only. What was picked lasts while Arden Code runs; a session not given its own view follows the
  setting.
- Status lines (the agent started, the person stopped the reply, a new conversation began) show in every view: they say
  what happened, not how.

## Consequences

- In the Normal view, what a tool answered is one click away instead of always shown, so replies with long tool output
  are shorter. This changes the default look.
- A session's own view is not saved: after a restart, every session follows the setting again. Saving it would add a
  field to every session; that can come later if it is missed.
