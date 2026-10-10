# 0045. The message box on one row

- Status: Accepted
- Date: 2026-10-11
- Changes "the menus look like controls" in [0041](0041-choosing-how-a-session-starts.md), "the figures move to the
  message box" and "the lower line" in [0044](0044-permission-modes-the-context-window-and-the-agents-icon.md), and plan
  sections 6.5 and 6.12.

## Context

The maintainer said the message box looks bad, and showed the welcome screen. Its lower line held five outlined menus
(agent, project, model, effort, permission mode), then the figures and Send. At a common window width they do not fit on
one line, so the figures and Send wrapped onto a line of their own, Send alone in the corner, and the five outlined boxes
inside the box's own border read as a form. A disabled Send was a gray square that looked broken rather than waiting.

## Decision

- **The menus are quiet buttons.** Agent, project, model, effort and permission mode keep their icon, choice and
  chevron, and their names ("Model: Opus"), but have no border: they fill in on hover and while open, as the other
  quiet buttons do. The chevron still says they open a menu. In a high contrast theme, Windows draws their border.
- **The figures sit under the box.** The one quiet button with the context window and the usage limits ("Context 13% ·
  5-hour 42% · Weekly 18%") moves out of the lower line, to the end of a line under the box, and opens the same details.
  A Claude message box keeps that line's height even while it has no figures, so the box does not move when they
  arrive.
- **Send stays on the lower line,** at the end of its last row, after the menus. It has no fill while there is nothing
  to send, and fills once there is.
- The lower line still wraps when the box is narrow; Send wraps with the last menu.

## Consequences

- The lower line fits on one row at the welcome screen's usual width, and the box reads as one place to write.
- The figures are a step further from Send, but still in the box's column, where the person looks while working.
- The message box's screenshots change on purpose.
