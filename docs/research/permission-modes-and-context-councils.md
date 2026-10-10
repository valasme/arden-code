# Permission modes, the context window, Ultrathink and the agent's icon: the councils

- Date: 2026-10-10
- Input: the maintainer's request (below) and its five screenshots, [the research](permission-modes-and-context.md),
  ADRs 0003, 0015, 0032, 0038, 0039, 0041, 0042 and 0043, plan sections 3, 6.12, 7.3 and 7.5,
  [the vendors page](../vendors.md), and the codebase at `71d0958`.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides: product (P),
  experience (E), architecture (A), reliability (R) and delivery (D). Where a side objected, the objection is kept with
  what settled it. The interview put ten questions, each with a recommended answer; the maintainer asked for the
  councils to answer them, so each recommendation was weighed as the first option, and a second round settled what the
  verdicts opened.

## The request

"Can we not use the official Claude svg instead of that ugly icon? Also, the usage doesn't show in the app, and the
context isn't either. We need to add that as features. There's also no Ultrathink indicator, maybe adding that to the
input box would be good? There's also no auto, manual, bypass permissions etc. Also fix the UI issues in the images."
The screenshots show the welcome screen's message box with the sparkle beside Claude, a Claude session with no status
bar, the session's message box ("Claude · arden-code" beside the model and effort menus), Settings → Appearance with
the Smooth scrolling switch, and Claude Desktop's own Mode menu (Auto, Manual, Accept edits, Plan, Bypass permissions).

## Round 1

### Q1. The Claude logo

Options: **(a)** an icon Arden Code draws itself in place of the sparkle; **(b)** also ask Anthropic for written
permission, and switch to its logo, unchanged, once granted; **(c)** the official logo now.

- **Product:** P1 the maintainer finds the sparkle ugly and wants Claude to be recognisable in the menu. P1 the menu
  already says "Claude" beside the icon.
- **Experience:** E1 the icon's job is to say what the menu chooses (ADR 0042); the name says which agent. E1 Claude's
  mark is orange, and the UI keeps vendor colors out (plan section 7.3); the guidelines forbid recoloring it.
- **Architecture:** A1 ADR 0003 kept vendor logos out "until each vendor's brand guidelines have been reviewed". They now
  are: the Legal and compliance page asks for written permission for any use of Anthropic's logos beyond naming Claude
  Code in plain text, and the Trademark Guidelines allow the marks only in materials Anthropic approved beforehand.
- **Reliability:** R1 **dissents** to (c): it breaks the terms the vendors page promises to keep, and a takedown would
  hit a published release. Settled by choosing (a).
- **Delivery:** D1 (a) is one small change; (b) waits on a reply with no date.

**Verdict: (a).** (b) is the maintainer's to send; if Anthropic says yes in writing, a new ADR brings the logo in as it
is, colors included, as an exception to plan section 7.3. The vendors page records the check.

### Q2. Usage limits in the message box

Options: **(a)** move them from the status bar to the message box's lower line, before Send, for Claude sessions and
the welcome screen; **(b)** show them in both places; **(c)** the status bar only.

- **Product:** P2 the limits work (the research), but the maintainer turned the status bar off and never saw them. The
  message box is where they look while working, and where the next message is decided.
- **Experience:** E2 one place on screen is calmer than two (plan section 3); the lower line has room at its end. E2
  the rules of ADR 0043 stay: emphasis from 80% or Claude Code's warning, and "resets 15:10" at the limit.
- **Architecture:** A2 ADR 0043 said "nothing is added to the session view", because the limits are the account's, not
  the session's. **A2 dissents** to (a) on that ground. Settled: the message box is not the transcript; it already holds
  choices that outlive a session (model, effort), and the limits shown are the same whatever session is open.
- **Reliability:** R2 a Demo agent session's message box shows none: the figures are Claude's.
- **Delivery:** D2 the figures and their rules exist; they move with their tests.

**Verdict: (a).** The status bar keeps the agent's state, the update notice and the version. Settings → Agents keeps
its Usage limits row, and Show usage limits keeps turning both the asking and the showing off.

### Q3. The context window

Options: **(a)** a Claude session's message box shows how full its context window is, with the details on demand,
asked of Claude Code after each reply and kept with the session; **(b)** the same, kept in memory only; **(c)** nothing.

- **Product:** P3 the maintainer asked for it; it tells the person when to `/compact`, or to start a new session, before
  Claude Code compacts on its own.
- **Experience:** E3 at a glance a whole percentage ("Context 13%"); on demand the tokens used of the window ("130k of
  1M"), where Claude Code compacts, and the breakdown it reports. E3 no Compact button: `/compact` already works.
- **Architecture:** A3 `get_context_usage` is documented and stable (unlike `get_usage`), travels on the pipes the
  driver speaks, and with `detail: "summary"` answers from local estimates. A3 the size, the percentage and the
  compaction point all come from Claude Code: the window depends on the model, so Arden Code computes none of them.
  A3 the figure belongs to the session, so it is kept with it, like its model and effort.
- **Reliability:** R3 an error, an older Claude Code or an unknown shape leaves the figure as it was, and never stops a
  reply. R3 **dissents** to (b): a session opened after a restart would show nothing until its next reply, though its
  conversation, and so its context, has not changed.
- **Delivery:** D3 one request, one stored value, and a place in the lower line it shares with the usage limits.

**Verdict: (a).** The term is **Context window** (the glossary).

### Q4. An Ultrathink indicator

Options: **(a)** an "Ultrathink" chip with the lightbulb in the lower line while the next message will carry the word,
whether the switch is on or the word was typed, with a button to turn the switch off; **(b)** also tint the word in
the text; **(c)** a mark on the effort menu's button only.

- **Product:** P4 today the only sign is a checked switch inside a closed menu.
- **Experience:** E4 a chip where the choices are reads at a glance and can be undone in place. E4 (b) is what Claude
  Code's terminal does, in rainbow colors; plan section 3 keeps the UI calm, and a highlight layer behind the text box
  is fragile.
- **Architecture:** A4 the switch stays the message box's state, saved nowhere (ADR 0042); the chip reads the same rule
  as the word itself (`ultrathink` on its own, any case, never in a slash command).
- **Reliability:** R4 the switch turns itself off once a message is sent; the chip follows it.
- **Delivery:** D4 small.

**Verdict: (a).**

### Q5. Permission modes

Options: **(a)** a Permission mode menu in the lower line of Claude sessions and the welcome screen, after the effort,
listing Manual, Accept edits, Plan, Auto and Bypass permissions, each with a line saying what it does, changeable at any
time, even during a reply, and kept with the session; **(b)** the same, offering Don't ask too; **(c)** Manual only, as
today.

- **Product:** P5 the maintainer asked for Auto, Manual and Bypass permissions, and showed Claude Desktop's five.
- **Experience:** E5 the menu matches the others: an outlined button with an icon (a shield), the mode and a chevron,
  named "Permission mode: Manual". Each item has its name and a line of description, as in Claude Desktop. E5 Don't
  ask denies everything not allowed in advance, which in Arden Code looks like Claude failing for no reason; it is left
  out.
- **Architecture:** A5 Claude Code takes the mode at start (`--permission-mode`) and changes it in a running Claude Code
  with the documented `set_permission_mode`, with no restart; a `system/status` frame reports every change. A5 this
  ends ADR 0038's fixed `--permission-mode default` and ADR 0039's "every session starts in Claude Code's default
  mode". A5 the sessions file keeps the mode, as it keeps the model and effort.
- **Reliability:** R5 the mode is a safety boundary, so what Arden Code shows must be what Claude Code applies: the
  driver follows `system/status` and the answer to `initialize`, and a refused change leaves the earlier mode, with
  an error.
- **Delivery:** D5 the largest part; Bypass permissions, Plan mode's end and the keyboard are their own tickets.

**Verdict: (a).** The term is **Permission mode** (the glossary). Manual is passed as `default`, which every supported
Claude Code takes.

### Q6. Which mode a new session starts in

Options: **(a)** inherited as the model and effort are (ADR 0041), except Bypass permissions, which a new session
never takes; **(b)** always Manual; **(c)** inherited, Bypass permissions included.

- **Product:** P6 a person who works in Accept edits keeps doing so, as with the model.
- **Reliability:** R6 **dissents** to (c): a new session must not run unasked because an earlier one did. Plan and Auto
  carry over: Plan asks for more, and Auto was chosen in that project.
- **Architecture:** A6 the same rule as ADR 0041: the session the agent rule follows, when it has the same agent; a
  linked session from the session it was started from.

**Verdict: (a).** Where the rule gives Bypass permissions, or nothing, a new session starts in Manual. The welcome
screen shows the mode a new session there would take, until the person chooses.

### Q7. Guarding Bypass permissions

Options: **(a)** a setting in Settings → Agents, Allow Bypass permissions [off], without which the mode is listed but
cannot be chosen; **(b)** a confirmation each time it is chosen; **(c)** no guard.

- **Reliability:** R7 Bypass permissions runs any command and any edit without asking. Claude Code itself guards it
  behind a flag; Arden Code passes `--allow-dangerously-skip-permissions` only while the setting is on. **R7 dissents**
  to (c).
- **Experience:** E7 a deliberate setting once is clearer than a dialog every time, which people learn to click through.
  Off, the item stays in the menu, unavailable, and says "Turn on in Settings → Agents". While a session is in it, the
  menu's button takes the destructive color.
- **Architecture:** A7 Claude Code refuses the switch in a Claude Code started without the flag; the driver already
  remembers what each Claude Code was started with, and starts it again with `--resume` when the next message asks for
  something else (ADR 0041).
- **Product:** P7 turning the setting off moves every session in Bypass permissions back to Manual, at once.

**Verdict: (a).**

### Q8. When Claude finishes a plan

Options: **(a)** a plan card: the plan as Markdown, with Start, accepting edits; Start, asking first; and Keep planning,
which asks what to change; **(b)** the generic approval card, Allow or Deny.

- **Product:** P8 Plan mode is only useful if its plan can be read and started well.
- **Experience:** E8 the card sits where approval requests sit, under the tool call, is announced and notified as they
  are, and folds to a line once answered ("You started the plan, accepting edits").
- **Architecture:** A8 the request is Claude Code's `ExitPlanMode` approval request. Starting answers allow, with a
  `setMode` update to Accept edits or Manual; Keep planning answers deny with the person's words and no interrupt, so
  Claude carries on planning. Arden Code reads the plan from the request, never from Claude Code's plan file (ADR 0039).
- **Reliability:** R8 Stop, archiving and deleting deny it, as they do any approval request; a request with no plan text
  says so, and can still be answered.

**Verdict: (a).**

### Q9. The keyboard

Options: **(a)** a Next permission mode command with a rebindable shortcut, Ctrl+Shift+M, and the digits 1 to 5 in the
open menu; **(b)** Shift+Tab in the message box, as in Claude Code's terminal.

- **Experience:** E9 Shift+Tab moves the focus back out of the message box; taking it fails WCAG 2.2's keyboard rules
  (plan section 10). **E9 dissents** to (b).
- **Architecture:** A9 commands carry shortcuts the person can rebind (plan section 6.4); Ctrl+Shift+M is free, and
  the web engine's own shortcuts are off outside developer mode.
- **Reliability:** R9 the change is said aloud (a polite announcement), since the focus does not move.

**Verdict: (a).**

### Q10. The UI issues in the screenshots

- **Experience:** E10 four: (1) in Settings, the Smooth scrolling switch sits at the start of its column instead of
  its end, because the restart note under it is wider and the column does not align its children to the end; (2) the
  sparkle (Q1); (3) no usage limits on screen (Q2); (4) after the first message, "Claude · arden-code" sits in gray
  beside outlined menus and reads unfinished, and it takes room the new controls need.
- **Product:** P10 the maintainer asked for the issues to be fixed, not listed back.

**Verdict:** all four are fixed; (4) is settled in round 2.

## Round 2

| # | Question | Verdict and why |
|---|---|---|
| 11 | The agent's icon | E1: Lucide's bot for Claude, at 16 px and the label's color like every icon in the line; the Demo agent keeps its flask. A bot says "an agent", which is what the menu chooses, and mimics no one's mark. The agent menu's items show the icons too. Codex gets its own when its driver is written. |
| 12 | Where the agent and project go after the first message | E10, A2: they can no longer change, so they leave the lower line and join the session's header, where the title is: the agent's badge gets the agent's icon, and the project's name follows with a folder icon. The lower line keeps only what the next message can change, plus the figures and Send. Before the first message, the menus stay as ADR 0039 has them. |
| 13 | The lower line's layout | E2, E4, E5: at the start, the agent and project menus (while the session is empty), the model, the effort, the permission mode and the Ultrathink chip; at the end, the figures and Send. On a narrow box the line wraps, and the end group stays together. D: no prototype, since the maintainer is away; the pull request's screenshots show it, and the layout is a two-way door. |
| 14 | The figures | E2, E3: one quiet button before Send: "Context 13% · 5-hour 12% · Weekly 15%", each part only when known, so the welcome screen shows only the limits. Pressing it opens a popover: the context window (percentage, tokens used of the window, where Claude Code compacts or that it does not, and the breakdown), then each limit with its reset time. A figure near its limit takes the foreground color in medium weight; a limit reached reads "5-hour limit reached, resets 15:10". E: a button with a popover, not a tooltip, because the breakdown is long and must be reachable by keyboard and screen reader (ADR 0015). |
| 15 | When the context figure is near its limit | A3: from 80% of the point where Claude Code compacts (`autoCompactThreshold`), or of the window when Claude Code does not compact. The figure shown is Claude Code's `percentage` of the window. |
| 16 | When the context window is asked | A3, R3: when a Claude reply ends, on the session's own Claude Code, with `detail: "summary"`. Nothing is asked for a session whose Claude Code is not running: its kept figure stands until its next reply. |
| 17 | What is kept | A3: tokens used, the window's size, the percentage, the compaction point (when Claude Code compacts) and the breakdown's names, tokens and kinds, kept with the session (a migration of the sessions file). Skill, memory file and tool names are not kept. R: an unknown category kind is kept as reported and shown by its name. |
| 18 | The Ultrathink chip | E4: after the permission mode menu, the lightbulb and "Ultrathink". With the switch on, the chip ends with a button, "Turn off Ultrathink"; with the word typed, it has none. Not a live region: the switch's own state is announced in the menu. |
| 19 | The permission mode menu | E5: a shield icon; the menu opens on a label, "Permission mode"; each item has its name, a line of description and its digit; the chosen one is checked. Manual: asks before editing files or running commands. Accept edits: edits files without asking, and asks before commands. Plan: explores and plans, and changes nothing until you approve. Auto: a classifier approves or denies actions instead of asking you. Bypass permissions: never asks. It stays enabled while a reply runs. Shown for Claude only, as the model and effort are. |
| 20 | A refused or impossible change | R5, A7: a change Claude Code refuses leaves the session in the mode Claude Code reports, and a toast says why, with a code. Bypass permissions chosen for a Claude Code started without the flag is not sent: the driver starts that Claude Code again with `--resume` at the next message, as for a new model, and ends it now if no reply is running. |
| 21 | Claude Code changing the mode itself | A5: when Claude Code reports a mode (entering Plan mode itself, a plan started), the session takes it and keeps it. A mode Arden Code does not offer is logged and left alone. |
| 22 | The plan card's words | E8: the title "Claude has a plan"; the plan as Markdown; Start, accepting edits (first); Start, asking first; Keep planning, which opens a field, "What should change?", and Send. Folded: "You started the plan, accepting edits", "You started the plan, asking first", "You asked Claude to keep planning". Without plan text: "Claude did not send the plan's text." |
| 23 | The Bypass permissions setting | E7: Settings → Agents, under Show usage limits: "Allow Bypass permissions" [off], "Lets a Claude session run commands and edit files without asking. Use it only in a folder you can afford to lose." Turning it off moves sessions in Bypass permissions to Manual, their running Claude Codes included. |
| 24 | The command | A9: "Next permission mode", in the Session group, Ctrl+Shift+M: Manual, Accept edits, Plan, Auto, then Bypass permissions when it is allowed, then Manual again, for the open Claude session. Unavailable elsewhere. The new mode is announced politely. |
| 25 | The status bar | E2: it keeps what the agent is doing, the update notice and the version. Its usage figures move to the message box. |
| 26 | An ADR | Hard to reverse (a new request in the driver and two columns in the sessions file), surprising (why not the official logo; why the limits left the status bar), and real trade-offs: **ADR 0044**. It changes ADR 0003's logo line, 0038's fixed mode, 0039's lower line and "later" list, 0042's Ultrathink and 0043's place for the limits. |
| 27 | Tests | D: the highest seams the codebase already has. Rust: the Claude driver run by the store with a script of frames (ADR 0038) for the start flags, `set_permission_mode`, `system/status`, a refused change, the Bypass flag, the plan's answers and `get_context_usage`; the sessions file's migrations; the stand-in `claude` answering `get_context_usage` and `set_permission_mode` for the end-to-end test. The page: the app tests with IPC mocked (prior art `claude.test.tsx`), and each new component's own test. Each new or changed end-to-end test runs 10 times before merging (CLAUDE.md). |
| 28 | Branches and tickets | D: one branch and one pull request, one commit for the documents and one for each ticket, in dependency order: the Settings switch, the agent's icon, the header, the usage limits in the message box, the context window, the Ultrathink chip, the permission mode, Bypass permissions, the plan card, the command. |
