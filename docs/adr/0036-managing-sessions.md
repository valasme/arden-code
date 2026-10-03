# 0036. Managing sessions

- Status: Accepted
- Date: 2026-10-02
- Changes the sidebar and session view parts of [0032](0032-the-redesign.md), the context menus of
  [0024](0024-areas-context-menus-and-browser-features.md), and plan sections 5.7, 6.1, 6.4 and 6.11.

## Context

A session can be started, written in and read, and nothing else: it cannot be renamed, put away, kept at hand,
removed or carried on from. With sessions saved (ADR 0035) they pile up, and the sidebar becomes a list nobody can
tidy. The maintainer asked for delete, archive, pin, unpin, and a way to start a new session linked to the current
one.

Each choice below was weighed from five sides: the product (its owner, a power user, a newcomer, other apps, the
scope), the experience (interaction, visual design, accessibility, Windows conventions, the words), the architecture
(the domain, storage, the contract between Rust and the UI, the UI's state, the real agents to come), reliability
(tests, data safety, privacy, performance, concurrency) and delivery.

## Decision

- **One menu per session,** with the same items wherever it opens:
  - from a "…" button at the end of the session's row in the sidebar, shown while the row is pointed at or has the
    focus. It sits beside the row's link, not in it, and stays out of the Tab order, so Tab still moves row to row;
  - from a right click on the row, Shift+F10 or the Menu key, through the context menu host, which ADR 0024 left room
    for;
  - from a "…" button in the open session's header.

  The items are New linked session, Rename, Pin or Unpin, Archive or Unarchive, and Delete, whichever apply. An item
  runs once the menu has closed, so a dialog it opens keeps the focus.
- **Commands.** Each action is also a command for the open session, in the Session group. The palette lists it only
  when it applies, and it can be rebound like the others: New linked session (Ctrl+Shift+N, beside Ctrl+N), Rename
  session (F2), Pin session, Unpin session, Archive session, Unarchive session and Delete session. Archived sessions,
  in the Go to group, opens the archived sessions page.
- **Keys on a row,** as in File Explorer: F2 renames the session whose row has the focus (elsewhere, the open session),
  and Delete deletes it after the confirmation. Delete is not a command: anywhere else, it edits text.
- **Rename** opens a small dialog with the name selected, rather than editing the row in place: it works the same from
  the sidebar, the header, the palette and F2, also with the sidebar hidden. A name is trimmed and has 1 to 100
  characters (`ARD-AGT-006` otherwise). A session that was renamed keeps its name when its first message is sent.
- **Pinned sessions** are listed under Pinned at the top of the sidebar, across projects, in the order they were
  pinned, as starred and favorite items are in Claude, Slack and Linear. A pinned session leaves its project's list.
  The section shows only while something is pinned.
- **The order.** Each project's sessions are listed with the most recently used first: the session written in last is
  at the top, as in Claude Desktop and ChatGPT.
- **A folder project with no sessions in its list is not shown.** The Playground always is, since New session starts
  there. Removing a project is left for later.
- **Archive** puts a session away without losing it. An archived session leaves the sidebar's lists. Archiving also
  unpins it, so no hidden pin comes back later, and stops a reply that is still running. A notice says "Session
  archived" and offers Undo; a screen reader hears it, and Alt+T reaches it.
  - The **Archived sessions** page (`/archived`) lists the archived sessions, the most recently archived first, each
    with its project, the date it was archived, Unarchive and Delete. The sidebar shows an Archived row above Settings
    while something is archived.
  - An archived session opens read-only. In place of the message box, it says "This session is archived." and offers
    Unarchive, and Rust refuses a message, a rename or a pin (`ARD-AGT-005`). It can still start a linked session:
    that is how old work carries on without unarchiving it.
- **Delete** is for good, so a confirmation asks first, with the focus on Cancel; archiving is the way to put something
  away for a while. An undo notice was turned down: undoing within a few seconds is hard to reach by keyboard and by
  screen reader (WCAG 2.2.1), and the session would still be lost if the app closed meanwhile. A running reply is
  stopped first. Deleting the open session goes to the welcome state, and a notice says "Session deleted".
- **A linked session** is a new, empty session started from another one, in the same project and with the same agent,
  that keeps a link back to it. Nothing is copied, and nothing is handed to the agent: the link is between the
  sessions. The new session says "Linked from" and the other's name; the other says "Linked to" and the names of the
  sessions linked to it, each a link. Deleting either end drops the link. Copying the turns (a fork) and handing the
  agent a summary were turned down: the first is a different feature, and the second belongs to the real agents.
- **The focus is never lost.** When a row leaves a list, by archive or delete, the focus moves to the next row, else
  the previous one, else New session. When a pin moves a row to the other list, the focus goes with it.
- **Restoring the last session.** Rust remembers the session that was opened last. At start, with "On startup:
  Restore the last session", it hands that session to the page the way it hands the session of a folder opened from
  the terminal, and a folder opened from the terminal wins. A session that was deleted or archived is not restored.
- **Left for later:** finding a session from the command palette (#71), removing a project (#72), and exporting a
  session, copying one, choosing several at once and reordering pins by hand.

## Consequences

- A session can be tidied, kept at hand and carried on from, by mouse and by keyboard, and what is done to it lasts.
- The context menu host has its first target that is not text.
- The list Rust gives the sidebar holds its sections in order: the pinned sessions, each project with its other
  sessions, and the archived sessions.
- Real agents will be able to use a link to pass work from one session to the next.
