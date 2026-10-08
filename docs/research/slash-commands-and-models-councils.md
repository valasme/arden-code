# Slash commands, exact models, Ultrathink and the message box's icons: the councils

- Date: 2026-10-08
- Input: the maintainer's five requests (below), [the research](claude-commands-and-models.md), ADRs 0038, 0039 and 0041,
  [the session-choices councils](session-choices-councils.md), and the codebase at `fb3dda2`.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides: product (P),
  experience (E), architecture (A), reliability (R) and delivery (D). Where a side objected, the objection is kept with
  what settled it. The maintainer asked for the work to run on its own ("follow the council workflow"), so each question
  below has a verdict, and the interview's recommendations were weighed as the first option.

## The requests

1. Claude's own slash commands are missing.
2. So are the commands of plugins and skills.
3. Choosing an exact model, such as Haiku 5.5, Sonnet 5.5 or Opus 5.5, and an older one for a particular reason.
4. Ultrathink: is there a keyword trigger, and should it be an effort option?
5. The message box's menus show icons that do not match what they choose, and the icons are slightly dark.

## Round 1

### Q1. What a slash command is called

- **Architecture:** A1 `GLOSSARY.md` already says **Command** is an action of Arden Code in the palette; reusing the word
  for `/compact` would make "command" mean two things. A1 "Skill" is one kind of what Claude Code lists; MCP prompts and
  Claude Code's own commands are not skills.
- **Experience:** E5 the menu says "Slash commands" and each row starts with a slash, as in the terminal.

**Verdict:** the term is **Slash command**, an action of an agent CLI that is run by starting a message with a slash and
its name. _Avoid_: command (taken), skill, shortcut.

### Q2. Where the list of slash commands comes from

Options: **(a)** Claude Code's own list, from the answer to `initialize` and `commands_changed`; **(b)** a list kept in
Arden Code; **(c)** reading the `.claude` folders.

- **Product:** P2 the person's own skills and plugins are the point of request 2; only (a) lists them.
- **Architecture:** A2 (b) is a copy that goes stale with every Claude Code release. A4 (c) breaks ADR 0003 and plan
  section 13: Arden Code never reads Claude Code's files.
- **Reliability:** R1 (a) is tolerant: a field Arden Code does not know is ignored, as ADR 0038 says. R3 the list is
  data from the person's own Claude Code, shown as text, never run by Arden Code.
- **Delivery:** D5 no new frames to send: the driver already sends `initialize`.

**Verdict: (a).** The latest list replaces the one before, as the SDK's types say.

### Q3. How the menu behaves

- **Product:** P4 Claude Code's own menu is the model: type `/`, filter, choose.
- **Experience:** E1 it opens when the message starts with `/` and has no space yet, and filters by the typed letters
  against a name or an alias, from its start or from a word within it, ignoring `:`, `_` and `-`. E2 each row shows
  `/name`, the argument hint, the description and the source (built in, the plugin's name, or MCP). E3 the message box is
  a combobox, the list a listbox, the highlighted row is the active descendant, and the number of matches is announced
  politely. E4 arrow keys move; Tab fills in `/name `; Enter fills it in when the command takes arguments and otherwise
  sends it; Esc closes the list and keeps the text (and does not stop a reply). E5 an empty list says "No slash command
  matches". **E3 dissents:** Enter that sometimes fills and sometimes sends is not predictable. Settled: that is how
  Claude Code's menu behaves, and the hint shows which one a row is.
- **Architecture:** A3 only Claude sessions have it; the Demo agent has no slash commands.
- **Reliability:** R2 text that matches nothing is sent as typed, so Claude Code answers "unknown command" itself.

**Verdict:** as above.

### Q4. Commands that change what Arden Code also holds

- **Architecture:** A1 the model and effort are held by the session (ADR 0041) and its Claude Code is restarted when they
  change; `/model` and `/effort` sent to Claude Code would change only the running process, and the next restart would
  undo them. A1 `/clear` makes a new conversation, but Arden Code would `--resume` the old id at the next start. A1
  `/rename` names Claude Code's own copy, not the session.
- **Product:** P2 people type these by habit.
- **Reliability:** R5 handling them in the page needs no new protocol frames and cannot desynchronize.

**Verdict:** Arden Code handles four commands itself and does not send them: `/model x` and `/effort x` set the menu
(`/effort auto` and `/model default` mean Default); `/rename` renames the session, opening the Rename dialog with no
name; `/clear`, `/reset` and `/new` start a new session as New session does, and leave the session as it was. Every other
command goes to Claude Code. A `conversation_reset` frame from Claude Code (for example when a plan is accepted with the
context cleared) makes the driver remember the new conversation's id, and the reply says a new conversation started.

### Q5. Which models

- **Product:** P2 "what if someone wants an older model for a weird, specific reason": Claude Code lists them, by full id.
- **Architecture:** A2 a fixed enum cannot hold them, and would be wrong again at the next release. A5 the session keeps
  the `value` Claude Code gave for the row: an alias (`opus`) or a full id (`claude-opus-4-8`).
- **Reliability:** **R3 dissents** to free text: the value is passed as an argument to a program. Settled: the value
  comes only from Claude Code's own list, and is checked again before it is passed: letters, digits and `.`, `-`, `_`,
  `[`, `]` only, 64 characters at most. A saved value that is not on the list (retired, or an older Claude Code) is
  kept, shown as it is and marked "not in the list", and still passed.
- **Experience:** E1 the newest of each family first, as Claude Code lists them, then a heading "Older models" for rows
  whose value is a full id other than a family's latest. E5 each row shows its display name and description.
- **Delivery:** D1 the aliases the earlier four-name list held (`fable`, `opus`, `sonnet`, `haiku`) stay valid in saved
  sessions; the sessions file needs no migration.

**Verdict:** Claude Code's list, no free-text field, ADR 0041's list replaced. Haiku 5.5 appears when Claude Code 2.1.293
or later is installed.

### Q6. Ultrathink

- **Product:** P2 Claude Code documents `ultrathink` as a word in the message that deepens one turn; it works today when
  typed.
- **Experience:** E1 a switch at the end of the effort menu, after a separator, named Ultrathink, with "next message" as
  its hint. E2 it adds the word `ultrathink` to the end of the next message, and then turns itself off, as the keyword
  works for one turn. E3 the word stays in the message, so the person sees what was sent. **E1 dissents:** a switch that
  stays on would suit people who always want it. Settled: that is what Max is for; a one-turn switch matches Claude
  Code.
- **Architecture:** A3 it is state of the message box, not of the session: nothing is saved.
- **Reliability:** R2 a message that already holds the word is not given a second one; a slash command is not given the
  word.

**Verdict:** as above. Ultracode (a setting that plans workflows) is not offered.

### Q7. Icons

- **Product:** P1 "they don't match what they actually do, and they are slightly dark".
- **Experience:** E2 the agent: a sparkle for Claude, a flask for the Demo agent; the project: a folder; the model: a
  brain; the effort: rising bars, which also read as "more"; Ultrathink: a lightbulb. E1 every icon is 16 px (plan section
  7.5) and takes its label's color, not `muted-foreground`, so it is as bright as the text beside it; the chevron stays
  quiet.
- **Reliability:** R1 the design system page's screenshots must show all four menus; the old baseline hid the change
  because it was within the 1% tolerance, so the sample gets a taller, clearer layout and the baselines are renewed.

**Verdict:** as above.

## Round 2

| # | Question | Verdict and why |
|---|---|---|
| 8 | The list before any session's Claude Code has started | A1, R3: Arden Code starts one Claude Code in the Playground (always trusted), once per start, only to hear its answer to `initialize` and the lists it then pushes, and ends it. No message is sent, so no API call is made. Every running Claude Code also keeps the lists current. D5: commands that belong to a project appear once Claude has run in it. |
| 9 | Commands the menu hides | E5: names that start with `__`, `workflow-launch-exec`, and the commands `system/init` lists as bound to the terminal (`doctor`, `color`, `focus` and `reload-plugins` until Claude Code says otherwise). |
| 10 | Effort levels and models | R2: the effort menu lists the levels the chosen model supports, from the list (Opus 4.6 has no Extra high); a model with none, such as Haiku 4.5, has the menu disabled. A chosen level the model lacks is left as it is: Claude Code runs the highest level at or below it. Default's row follows the Default model's levels. |
| 11 | `/compact` | D5: sent as typed; Claude Code's own answer is what the reply shows. No special handling. |
| 12 | The sessions file | A2: no change. The model column already holds text. |
| 13 | Branches and tickets | D1, D2: one branch, one pull request, one commit for each of the five tickets: icons, Ultrathink, models, slash-command menu, then the documents. |
