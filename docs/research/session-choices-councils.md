# Choosing how a session starts, finding sessions, removing projects: the councils

- Date: 2026-10-04
- Input: the maintainer's list of eleven requests (2026-10-04, with screenshots), issues #71 and #72, ADRs 0034,
  0036, 0038 and 0039, and the codebase at `b61652d`. Claude Code 2.1.286's `--help` was read for its `--model` and
  `--effort` options.
- Method: as in [the Claude councils](claude-agent-councils.md), every question was weighed from five sides, by the same
  25 roles. Where a role disagreed, its objection is kept, together with what settled it. The maintainer asked for the
  councils to decide on their own, so every question below has a verdict.

## The requests

1. The welcome screen ("What should Claude work on?") has no menu for the agent, and none for the project.
2. Choosing the model and the effort.
3. The agent and project menus of a new session look wrong.
4. Settings → Agents says "How to install" for an installed agent.
5. The open source licenses can only all be seen by searching.
6. #71 (find a session from the command palette) and #72 (remove a project from the sidebar).
7. Delete the merged `feat/managing-sessions` branch (done, no council needed).
8. Menus stick to the side: the session's ••• menu, and the window menu.
9. Tooltips sometimes stay open after the pointer has left.
10. The scrollbars are too much.
11. A setting to turn off smooth scrolling.

Items 4, 5, 8, 9, 10 and 11 were triaged as #89 to #94, with agent briefs; the councils only settled what the briefs left
open (Round 3).

## Round 1

### Q1. The welcome screen, and choosing a project before starting

Options: **(a)** the welcome screen's message box gets the same menus as an empty session, with the project chosen in
advance; **(b)** as (a), and Claude no longer works in the Playground; **(c)** no project is chosen in advance, and Send
asks for one.

- **Product:** P1 the owner's words were "you should choose a directory before starting": today the welcome screen sends
  every first message to the Playground, with no way to choose. P3 the newcomer must still be able to try Claude with no
  folder, which (b) takes away. P4 Claude Desktop and T3 Code put both choices in the composer of an empty conversation,
  with the last project already chosen. **P1 weighed (c)**: settled because the menu is now always in sight, and the
  project chosen in advance is the one the person last worked in, so the Playground is only chosen for them before they
  have chosen anything else. P5 (a) is the smallest change: the welcome screen reuses the empty session's menus.
- **Experience:** E1 an extra step before every first message (c) is friction the person pays every time to fix a
  default they see. E5 the question keeps naming the agent.
- **Architecture:** A1 a session keeps one project; the welcome screen is not yet a session, so the choice is held by the
  page until Send starts the session. A4 the project chosen in advance is the project of the latest session, else the
  Playground: the same rule ADR 0039 gives New session, without an open session to follow.
- **Reliability:** R3 a folder chosen here still needs trusting before Claude first runs in it (ADR 0039).
- **Delivery:** D1 one ticket, after the menus are restyled (Q2), so the welcome screen gets the new look at once.

**Verdict: (a).** The welcome screen's message box holds the agent, project, model and effort menus of an empty
session. Its project starts as the project of the latest session, else the Playground. Claude may still work in the
Playground.

### Q2. How the menus in the message box look

- **Product:** P1 "both dropdowns are bad": in the screenshot they are small muted text with a chevron, read as a
  caption more than as controls.
- **Experience:** E2 each becomes a small outlined button: an icon (the agent's mark, a folder, a chip for the model, a
  gauge for the effort), the name and a chevron, on the same 24px line, with the gap the line already has. E1 the
  project menu shows each project's path under its name, the Playground first, then folders by latest use, then Open
  folder… with its shortcut. The agent menu shows an agent whose CLI is missing as disabled, with "Not installed". E3
  each button's accessible name says what it chooses and what is chosen ("Agent: Claude"); a menu of choices is a radio
  group. E4 the menus open below their button, inside the window.
- **Architecture:** A3 the project menu reads paths it already has (`Project.path`).
- **Reliability:** R1 the visual screenshots of the message box change on purpose.
- **Delivery:** D1 first ticket of the session-choices work.

**Verdict:** as above. After the first message, the agent and project stay as plain text; the model and effort stay
menus (Q5).

### Q3. Which models

- **Product:** P2 aliases are what Claude Code's own `/model` offers first, and they never go stale. **P2 dissents:**
  some want a full model name. Settled: Default means Claude Code's own setting, which can name any model, so nothing is
  lost. P5 no free text field.
- **Architecture:** A5 Codex has models too: the model is a short string the agent understands, not an enum of Claude's
  names; each agent lists its own choices. A2 the session stores the alias, or nothing for Default.
- **Reliability:** R3 the alias comes from Arden Code's own list, never from typed text, and is passed as one argument
  (ADR 0028).
- **Delivery:** D3 the aliases are Anthropic's own words; D5 a new family means one line in the list.

**Verdict:** Default (no `--model`, Claude Code's own setting), Fable, Opus, Sonnet and Haiku, passed as `--model fable`
and so on. ADR 0038's "no `--model`" changes: Default keeps it.

### Q4. Which efforts

- **Product:** P2 all five of Claude Code's levels, and Default.
- **Experience:** E5 Low, Medium, High, Extra high, Max; "Default" is its own first choice.
- **Architecture:** A1 the glossary needs **Model** and **Effort**. A5 effort is an enum Arden Code owns; each agent
  maps it to its own words, and an agent that has no such option hides the menu.
- **Reliability:** R1 the launch arguments are a pure function, tested for each choice.

**Verdict:** Default (no `--effort`), Low, Medium, High, Extra high and Max, passed as `--effort low` … `--effort max`.
The model and effort menus show only for Claude; the Demo agent has neither.

### Q5. When the model and effort can change

- **Product:** P2 in the terminal, `/model` changes the model mid-conversation; people switch to a bigger model for a
  hard step.
- **Experience:** E1 the menus stay in the message box after the first message, and are disabled while a reply runs.
- **Architecture:** A1 unlike the agent and project, they are not part of what a session *is*. A3 one command sets
  them.
- **Reliability:** R5 the session's `claude` was started with the old arguments; it is ended when the choice changes
  and no reply is running, and the next message starts it again with `--resume`, as after the 10-minute idle end. The
  conversation carries on. **R4 dissents:** a restart costs a second or two before the next reply. Settled: only the
  first reply after a change pays it, and Claude Code's own control request for the model is not documented for effort.
- **Delivery:** D5 no new protocol frames.

**Verdict:** any time no reply is running; the change applies from the next message.

### Q6. What a new session starts with

- **Architecture:** A4 the agent already follows a rule (that project's latest session, else the latest anywhere). The
  model and effort follow the same session's, when it has the same agent; else Default.
- **Product:** P2 a person who works on Opus keeps working on Opus without choosing it every time.

**Verdict:** as above. A linked session takes its model and effort from the session it was started from.

## Round 2

### Q7. Sessions in the command palette (#71): ranking and layout

- **Product:** P2 jump to a session by name, as Ctrl+P jumps to a file. P4 Linear and VS Code list recent items with an
  empty search.
- **Experience:** E1 a Sessions group after the commands. With an empty search it shows the five sessions used last;
  typing matches session names (and their project's name), most recently used first. Choosing one opens it. E5 an
  untitled session is listed as "New session", as in the sidebar.
- **Architecture:** A3 the palette reads the session list it already has (`SessionList`); no new command.
- **Reliability:** R4 a few hundred sessions filter in the page instantly.

**Verdict:** as above.

### Q8. Archived sessions in the palette

- **Product:** P2 an archived session is still something to find. P5 not with an empty search: archived means put away.
- **Experience:** E1 an Archived group after Sessions, only while typing; it opens the archived session, read-only.

**Verdict:** as above.

### Q9. Telling sessions from commands, for a screen reader

- **Experience:** E3 group headings are read on entering a group ("Commands", "Sessions", "Archived"); each session
  item's name is its title and its project ("Fix login, in arden-code"). Commands keep their names.

**Verdict:** as above.

### Q10. Removing a project (#72)

Options: **(a)** Remove project forgets the project and deletes its sessions, archived ones too, after a confirmation
that says how many; **(b)** it archives its sessions; **(c)** it is offered only for a project with no sessions.

- **Product:** P1 the point is a tidy sidebar. A folder project already disappears once it has nothing in its list
  (#67), so (b) is "archive every session", which is a different, bulk command; (c) is offered when it is never needed.
- **Experience:** E1 Remove project… in the project's ••• menu and right-click menu in the sidebar. E5 the
  confirmation says "Remove arden-code? Its 4 sessions, including 1 archived, will be deleted. Claude Code keeps its own
  copies of the conversations." The default button is Cancel. The Playground has no Remove.
- **Architecture:** A2 removing a project deletes it, its sessions and their turns in one transaction; its trust goes
  with it. A3 one command. Opening the folder again adds it as a new, untrusted project.
- **Reliability:** **R2 dissents:** deleting many sessions at once is destructive. Settled by the confirmation naming
  the count, Cancel as default, and the agent conversations staying with Claude Code. R5 a running reply in any of its
  sessions is stopped and its `claude` ended first, as deleting a session does.
- **Delivery:** D4 the toast says "Project removed".

**Verdict: (a).**

## Round 3: smaller decisions, settled by consensus

| # | Question | Verdict and why |
|---|---|---|
| 11 | The agent's button in Settings → Agents (#89) | "How to install" only when not installed; "How to update" when too old; none when ready. E5: the button says the next step. |
| 12 | The license list (#90) | Every package, drawn when the section opens; the search only narrows. R4: about 870 short rows in a closed `<details>` cost nothing until opened. |
| 13 | The window menu (#91) | It opens under its button, and at the pointer for a right click on the bar, through Windows' own `TrackPopupMenu` on the window's system menu, whose choice is sent back as `WM_SYSCOMMAND`; Alt+Space keeps Windows' placement. E4: this is what a native caption does. Dropdown menus keep 8px from the window's edges. |
| 14 | Tooltips (#92) | Shown on hover and on keyboard focus only. Focus the app moves by script (a dialog or menu closing) opens none. E3: keyboard users still get them on Tab. |
| 15 | Scrollbars (#93) | Thin, no arrow buttons, a muted thumb on a clear track; system colors in contrast themes. E2: Windows 11's own apps draw thin bars. A custom scrollbar was refused (R4, E3). **Amended while building:** the standard `scrollbar-width` and `scrollbar-color` keep WebView2's arrow buttons, so the bars are drawn with the engine's `::-webkit-scrollbar` pseudo-elements, which the standard properties would switch off. |
| 16 | Smooth scrolling (#94) | A switch on the **Appearance** tab, after Reduce motion, on by default (E1: it sits with motion, not in Advanced). Off starts the web engine with `--disable-smooth-scrolling`, after a restart, with the restart note and prompt of hardware acceleration. |
| 17 | Glossary | New terms **Model** and **Effort** under Agents. |
| 18 | Branches and pull requests | D1, D2: three branches, each with one pull request, merged in turn: the six fixes (#89 to #94); #71 and #72; then the session-choices tickets. Each issue closes once its commit is green. |
