# 0039. Working with Claude

- Status: Accepted
- Date: 2026-10-03
- Changes the agent names of [0003](0003-license-privacy-and-vendor-posture.md), the message box and welcome state of
  [0032](0032-the-redesign.md), the first senders of [0029](0029-notifications.md), deleting a session in
  [0036](0036-managing-sessions.md), and plan sections 1, 5.6, 5.7, 6 and 13.

## Context

With the driver of ADR 0038, a person needs to start a Claude session in a project, see what Claude does, answer it
when it asks, and know whether Claude is ready. The councils weighed each choice
([the record](../research/claude-agent-councils.md)).

## Decision

- **Names.** The agent is **Claude**. **Claude Code** (`claude`) is its agent CLI, named in plain sentences such as
  "Claude Code 2.1.288, installed at …". This follows Anthropic's branding rules for agents, and
  [the vendors page](../vendors.md) keeps their current terms.
- **Starting a session.**
  - While a session is empty, the message box's lower line holds two menus, the agent and the project; after its first
    message they are plain text. The project menu ends with Open folder.
  - New session (Ctrl+N) starts in the open session's project, or the Playground. Its agent is the agent of that
    project's latest session, else of the latest session anywhere, else Claude when Claude Code is installed, else the
    Demo agent. Starting from the terminal follows the same rule.
  - Open folder (Ctrl+O) adds a folder as a project and starts a session in it.
  - Claude may work in the Playground.
- **Trust.** Claude first runs in a project only after the person trusts it, once per project: under `-p`, Claude Code
  runs a project's hooks, MCP servers and environment without asking. The question comes when a message would start
  Claude in a project not yet trusted, and says what trusting means; Cancel keeps the message in the box. Rust refuses
  to start Claude in an untrusted project. The Playground needs no trust.
- **Approval requests** are items in the reply, under the tool call they are about:
  - The card says what Claude wants to do in Arden Code's words (Run a command, Edit a file, Create a file, Open a web
    page, Search the web, Use a tool) and shows the details: the command, the file and its change, the address.
  - Its answers are Allow, Always allow and Deny. Always allow appears only when Claude Code suggests a rule, and
    hands that rule back. Deny stops the reply, as in the terminal, so the person can say what to do instead.
  - It is announced politely and at once, the status bar says Claude is waiting, and a notification is sent when the
    window is not focused. The focus does not jump: the card is the last stop before the message box.
  - Once answered, it folds to a quiet line ("You allowed …"). Stop, archiving and deleting answer it with a denial.
    One still waiting when Arden Code closes ends as cancelled with its turn.
- **Questions** (Claude asking the person to choose) are items too: each question with its options, as radio buttons
  or check boxes, an Other field, and Send answers. Stop cancels a waiting question.
- **What a reply shows.** Text and thinking stream. Tool calls end with their results. File changes come from Claude
  Code's own results for Edit, Write and NotebookEdit. A subagent's inner steps are not shown; its tool call is.
- **Settings → Agents** shows Claude Code's version, the minimum version, and whether it is signed in, from
  `claude auth status`, without the account's email. Detection runs once in the background after start and again
  with Look again.
- **Errors** have codes and say what to do: install Claude Code, run `claude update`, or open a terminal, run `claude`
  and sign in with `/login`. Arden Code never offers a sign-in of its own.
- **Deleting a Claude session** says that Claude Code keeps its own copy of the conversation in its folder. Arden Code
  never reads or changes Claude Code's files.
- **Later:** choosing the model, effort or permission mode (every session starts in Claude Code's `default`
  mode); attachments; slash-command menus; cost and usage; nested subagent views; linked sessions handing their
  context to Claude; raw mode; Codex.

## Consequences

- Claude works like the person's terminal Claude Code, with its answers in Arden Code's own interface, by keyboard and
  by screen reader.
- A session's agent and project can change only while it is empty.
- The sessions file stores each project's trust and each Claude session's conversation id, each with its migration.
- Notifications have their first senders.
