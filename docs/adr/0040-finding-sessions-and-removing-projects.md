# 0040. Finding sessions in the command palette, and removing a project

- Status: Accepted
- Date: 2026-10-04
- Changes the "left for later" of [0036](0036-managing-sessions.md), and plan sections 6.4 and 6.11.

## Context

ADR 0036 kept sessions and left two things for later: finding a session from the command palette (#71), and
removing a project (#72). Sessions pile up and can only be reached by scrolling the sidebar, and a folder project,
once opened, stays for good. [The councils](../research/session-choices-councils.md) weighed both (Q7 to Q10).

## Decision

- **Sessions in the command palette.** A Sessions group follows the commands. With nothing typed it lists the five
  sessions used last; while typing, every session whose name or project's name matches, the most recently used first.
  An Archived group follows, only while typing, with the archived sessions that match. Choosing one opens it; an
  archived one opens read-only. Each item is read as "Fix login, in arden-code". The palette's own scoring ranks the
  commands; sessions keep their order and stay after them.
- **Removing a project.** A folder project's name in the sidebar has a … button and a right-click menu with Remove
  project…. It asks first, saying how many sessions will be deleted, archived ones included, and that Claude Code
  keeps its own copies of the conversations; Cancel is the default. Removing stops replies in its sessions, ends their
  agents, and deletes the project, its sessions and their turns in one transaction, overwritten as deleting a session
  is. Its trust goes with it: the same folder opened again is a new, untrusted project. The folder on disk is not
  touched. The Playground cannot be removed (`ARD-AGT-017`).
- Archiving a project's sessions in bulk was weighed and turned down: a folder project with nothing in its list is
  already hidden, so it would only be a slower way to the same sidebar.

## Consequences

- Any session is a Ctrl+K and a few letters away.
- Removing a project is the one action that deletes many sessions at once; the question names the count so it is not a
  surprise.
