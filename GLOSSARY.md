# Arden Code

A Windows desktop cockpit where a developer runs and supervises coding agents on their projects.

## Language

### Work

**Project**:
A folder on the user's disk that agents work in.
_Avoid_: workspace, repo, directory

**Playground**:
The built-in project, a folder Arden Code creates for itself, for sessions that need no folder of the user's, such as Demo agent sessions.
_Avoid_: sandbox, demo project

**Trusted project**:
A project the user has agreed to let agents work in together with the setup the project brings along, such as its own hooks and servers.
_Avoid_: safe project, approved folder

**Session**:
An ongoing exchange of turns between the user and one agent, inside one project.
_Avoid_: chat, conversation, thread

**Pinned session**:
A session kept at the top of the sidebar, above the projects, until it is unpinned.
_Avoid_: favorite, starred

**Archived session**:
A session put away: off the sidebar's lists and read-only until it is unarchived.
_Avoid_: hidden, closed

**Linked session**:
A session started from another one, which it keeps a link back to.
_Avoid_: fork, branch, child session, follow-up

**Turn**:
One message from the user together with the agent's reply to it, whether the reply finished, was stopped or failed.
_Avoid_: exchange, round

**Item**:
One piece of an agent's reply within a turn: text, thinking, a tool call, a file change, an approval request, a question, an error or a status marker.
_Avoid_: event, chunk, block

**Tool call**:
An item recording an action the agent takes, such as running a command or reading a file.

**File change**:
An item recording an edit the agent made, or proposes to make, to a file in the project.
_Avoid_: diff, patch

**Approval request**:
A point where an agent pauses and asks the user to allow or deny an action.
_Avoid_: permission prompt, confirmation

**Question**:
A point where an agent pauses and asks the user to choose among answers it offers.
_Avoid_: prompt, clarification, elicitation

### Agents

**Agent**:
A coding assistant that works in a session: Claude, Codex, or the built-in Demo agent.
_Avoid_: model, bot, AI, assistant

**Demo agent**:
The built-in agent that produces realistic but fake replies, used before real agents are integrated.
_Avoid_: mock agent, fake agent

**Model**:
The version of an agent's underlying AI that a session works with, such as Opus or Sonnet for Claude, or Default to leave it to the agent CLI's own setting.
_Avoid_: engine, LLM

**Effort**:
How much an agent thinks before it answers in a session, from Low to Max, or Default to leave it to the agent CLI's own setting.
_Avoid_: thinking budget, reasoning level

**Slash command**:
An action of an agent CLI, run by starting a message with a slash and its name, such as /compact. It is built into the agent CLI, or comes from the person's skills, plugins or MCP servers.
_Avoid_: command (that is Arden Code's own action), skill

**Vendor**:
The company behind an agent: Anthropic for Claude, OpenAI for Codex.
_Avoid_: provider

**Agent CLI**:
A vendor's own command-line program through which Arden Code runs an agent: Claude Code (`claude`) for Claude, Codex (`codex`) for Codex. It owns the user's sign-in.
_Avoid_: SDK, backend

**Agent conversation**:
The agent CLI's own record of a session, kept in its own folder under an id Arden Code makes. It lets a session carry on where it left off after a restart. It belongs to the agent CLI, not to the session: deleting the session leaves it.
_Avoid_: using "conversation" alone for a session

**Raw mode**:
Running an agent's own terminal interface inside Arden Code, instead of the session view.
_Avoid_: terminal mode, console mode

### The window

**Session view**:
The main area of the window, showing the open session's turns and the message box.
_Avoid_: chat area, chat view

**Message box**:
Where the user writes the next message of a session.
_Avoid_: composer, input, prompt box

**Inspector**:
The right-hand pane showing details of the open session. Hidden by default.
_Avoid_: right panel, details pane

**Welcome state**:
What the session view shows when no session is open.
_Avoid_: splash screen, empty page

### Control

**Command**:
A named action the user can trigger from the command palette, a menu or a shortcut.
_Avoid_: action

**Command palette**:
The searchable list of every command.
_Avoid_: quick open, launcher

**Shortcut**:
A key combination bound to a command. Users can rebind shortcuts.
_Avoid_: hotkey, keybinding

**Setting**:
A user preference that Arden Code stores and applies immediately.
_Avoid_: option, preference, config

**Terminal command**:
The `arden-code` command that opens Arden Code, or a project in it, from a terminal.
_Avoid_: CLI (reserved for agent CLIs)

### Health

**Diagnostics bundle**:
A zip file the user exports for bug reports, containing logs, redacted settings and system information.
_Avoid_: debug dump, diagnostics export

**Error code**:
The short identifier, such as `ARD-SET-002`, shown with an error message and written to the logs.
_Avoid_: error number, error ID

### Brand

**Mark**:
The logo's symbol: the orange grid of rounded cells. On its own, it is the app icon.
_Avoid_: icon, emblem

**Wordmark**:
The words "Arden Code" set in Lora, as part of the logo.
_Avoid_: logotype, text logo

**Lockup**:
A fixed arrangement of the mark and the wordmark, horizontal or stacked.
_Avoid_: logo variant
