# 0044. Permission modes, the context window and the agent's icon

- Status: Accepted
- Date: 2026-10-10
- Changes the vendor logo line of [0003](0003-license-privacy-and-vendor-posture.md), the fixed
  `--permission-mode default` of [0038](0038-claude-through-its-own-protocol.md), the message box's lower line and the
  "later" list of [0039](0039-working-with-claude.md), the Ultrathink switch of
  [0042](0042-slash-commands-and-exact-models.md), the place of the usage limits in
  [0043](0043-usage-limits.md), and plan sections 5.8, 6.1, 6.3, 6.12, 7.5 and 13.

## Context

The maintainer asked for Claude's official logo in place of the sparkle, for the usage limits and the context window to
show, for a sign that the next message will Ultrathink, and for Claude Code's permission modes (Auto, Manual, Bypass
permissions and the rest), and pointed at the issues in five screenshots. [The research](../research/permission-modes-and-context.md)
probed Claude Code 2.1.292 and read Anthropic's terms; [the councils](../research/permission-modes-and-context-councils.md)
weighed each choice.

## Decision

- **No vendor logo.** Anthropic asks for written permission for any use of its logos beyond naming Claude Code in plain
  text, and allows no changes to them. Claude's icon in the agent menu is Lucide's bot, at the label's color; the Demo
  agent keeps its flask. If Anthropic gives permission in writing, a new ADR brings its logo in unchanged.
- **Permission mode** is a term of its own (the glossary): Manual, Accept edits, Plan, Auto or Bypass permissions.
  - A menu in the message box's lower line of Claude sessions and the welcome screen, after the effort: a shield, the
    mode and a chevron; each item with a line saying what it does, and its digit. Don't ask is not offered.
  - The driver starts Claude Code with `--permission-mode` (Manual as `default`) and changes a running one with the
    documented `set_permission_mode`, with no restart, during a reply too. It follows the `system/status` frames and the
    answer to `initialize`, so the session always shows the mode Claude Code applies; a refused change leaves that mode,
    with an error.
  - The sessions file keeps each session's mode. New sessions inherit it as they inherit the model and effort
    (ADR 0041), except Bypass permissions, which no session inherits.
  - **Bypass permissions** can be chosen only while Allow Bypass permissions [off] is on, in Settings → Agents; only
    then does Arden Code pass `--allow-dangerously-skip-permissions`. Turning it off moves every session in it to
    Manual. While a session is in it, the menu's button takes the destructive color.
  - **Plan mode's end:** Claude's `ExitPlanMode` approval request is a plan card: the plan, read from the request, as
    Markdown, with Start, accepting edits; Start, asking first (each switching the mode with a `setMode` update); and
    Keep planning, which sends the person's words back without stopping the reply.
  - **Keyboard:** the Next permission mode command, Ctrl+Shift+M and rebindable, and the digits in the open menu.
    Shift+Tab keeps moving the focus.
- **Context window** is a term of its own (the glossary). When a Claude reply ends, the driver asks Claude Code with the
  documented `get_context_usage` (`detail: "summary"`, no message to the model). The tokens used, the window's size, the
  percentage, the point where Claude Code compacts and the breakdown are kept with the session, so they outlive a
  restart. The size, the percentage and that point are Claude Code's; Arden Code computes none of them.
- **The figures move to the message box.** One quiet button before Send reads "Context 13% · 5-hour 12% · Weekly 15%",
  each part only when known, and opens a popover with the details: the context window's tokens, where Claude Code
  compacts and the breakdown, and each usage limit's reset time. A figure near its limit is emphasized (a usage limit
  from 80% or Claude Code's warning, as ADR 0043 had it; the context window from 80% of the point where Claude Code
  compacts). The status bar no longer shows the usage limits; Settings → Agents still does, and Show usage limits still
  turns them off.
- **Ultrathink** shows as a chip in the lower line while the next message will carry the word: the switch is on, or the
  word was typed. With the switch on, the chip can turn it off.
- **The lower line** holds only what the next message can change, then the figures and Send, and wraps when narrow.
  Once a session has its first message, its agent (with the agent's icon) and its project (with a folder) show in the
  session's header, by its title, instead of in the lower line.

## Consequences

- A person sees and chooses how freely Claude acts, and sees how full the context window and the usage limits are, in
  the one place they look while working, whether the status bar is on or not.
- The sessions file gains two columns, each with its migration.
- One more request per Claude reply, answered by Claude Code from local figures.
- Arden Code passes a flag that allows bypassing every permission check only when the person has turned the setting
  on, and Claude Code then still starts in the mode the session has.
- The vendors page records that the logo terms were checked.
