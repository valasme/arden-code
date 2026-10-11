# 0046. The message box keeps its draft

- Status: Accepted
- Date: 2026-10-11
- Changes "the lower line" and "the welcome screen's usual width" in
  [0045](0045-the-message-box-on-one-row.md), and plan sections 6.5 and 6.12.

## Context

The maintainer reported two things about the welcome state's message box.

- Send still went onto a row of its own (#127). The lower line was one wrapping row ending with Send, so when the menus
  and the Ultrathink chip just filled the row, Send alone wrapped under them. ADR 0045 said Send wraps with the last
  menu, but nothing held them together: its test passed only because, at the width it tried, the last menu wrapped
  too. At the welcome state's 40rem, the five menus and the chip leave no room for Send.
- Leaving the welcome state lost what was in it (#131): opening a session or Settings and coming back emptied the box
  and set the menus back. A session's message box did the same when another session was opened.

## Decision

- **Send keeps the end of the last row.** The menus (and the Ultrathink chip) wrap among themselves, beside Send, and
  Send lines up with their last row. It never sits on a row of its own, at any width.
- **The welcome state's message box is as wide as a session's,** at most 45rem, so its lower line fits on one row at
  the window's usual size, chip and all.
- **A message box keeps its draft:** what is written and not sent, and the Ultrathink switch, for the welcome state and
  for each session apart. The welcome state's draft also keeps what its menus were set to (agent, project, model,
  effort, permission mode). Leaving and coming back finds the draft as it was.
- **A draft lasts while Arden Code runs.** It is kept in the page's memory, not on disk: closing Arden Code forgets it.
- **Sending ends a draft.** The text goes with the message, the switch turns itself off (ADR 0044), and the welcome
  state's menus go back to what a new session inherits. A message that was not sent, such as one that asked to trust a
  folder and was cancelled, leaves the draft as it was. A chosen project that is removed is chosen no longer.

## Consequences

- The welcome state's lower line no longer breaks at the window's usual size, and when the window is narrow it wraps
  without leaving Send behind.
- Moving between the welcome state, sessions and Settings no longer costs what was half written.
- A draft does not survive a restart. Keeping drafts on disk would mean writing every keystroke's result through Rust;
  that can come later if it is missed.
