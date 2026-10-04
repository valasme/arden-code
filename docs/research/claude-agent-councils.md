# Claude as the first real agent: the councils

- Date: 2026-10-03
- Input: [the research](claude-agent.md), the codebase at `6b6682b`, and a probe of the real Claude Code 2.1.286
  (handshake and a signed-out reply, no API call).
- Method: as in ADR 0036, every question was weighed from five sides, by five roles each. Where a role disagreed, its
  objection is kept, together with what settled it. The maintainer asked for the councils to decide on their own, so
  every question below has a verdict.

## The 25 roles

| Council | Roles |
|---|---|
| **Product** | P1 the owner (calm, private, keyboard-first, Windows-native) · P2 a power user (lives in Claude Code every day) · P3 a newcomer (first launch, maybe no `claude` yet) · P4 other apps (T3 Code, Claude Desktop, the VS Code extension, Codex) · P5 the scope keeper |
| **Experience** | E1 interaction · E2 visual design · E3 accessibility (WCAG 2.2 AA, NVDA, Narrator) · E4 Windows conventions · E5 the words |
| **Architecture** | A1 the domain (the glossary) · A2 storage (`sessions.db`) · A3 the contract between Rust and the UI · A4 the UI's state · A5 the agents to come (Codex next) |
| **Reliability** | R1 tests (test-first, deterministic CI) · R2 data safety · R3 security and privacy · R4 performance (plan section 11) · R5 concurrency and process lifetime |
| **Delivery** | D1 slicing and order · D2 CI and a green `main` · D3 vendor terms · D4 operability (codes, logs, support) · D5 upkeep over time |

## Round 1

### Q1. How Arden Code talks to Claude

Options: **A** a Rust driver speaking `stream-json` and the control protocol to the person's `claude`; **B** the
TypeScript Agent SDK in a bundled Node or Bun process (T3 Code's literal method); **C** ADR 0017 as written, with an
MCP permission tool that Arden Code hosts.

- **Product:** P1 A: it is ADR 0017's "no JavaScript runtime", and keeps the app typed end to end. P2 indifferent, as long
  as their CLAUDE.md, skills, hooks and MCP servers load; all three do. P3 A: a smaller install. P4 T3 Code uses B, but
  the SDK speaks this same protocol underneath, so A is T3 Code's method without the middle layer. P5 A: no second
  process, no IPC layer.
- **Experience:** no visible difference. E4 notes that B puts a `node.exe` beside every session in Task Manager.
- **Architecture:** A3 A has one process boundary (Arden Code and `claude`); B has two. A5 A: `codex app-server` is
  JSON-RPC over stdio, so the line transport, the piped child and the job are reused for Codex.
- **Reliability:** R1 A is tested in Rust with scripted frames; B needs a JavaScript test bed too. R3 A keeps npm out of
  the core path (ADR 0020). R4 B adds a JavaScript runtime's memory to every open session. R5 A: one child per
  session, in the job.
- **Delivery:** D3 B means shipping Anthropic's SDK inside Arden Code, under its Commercial Terms; A ships nothing of
  Anthropic's. **D5 dissents:** with B, Anthropic keeps the protocol client current. Settled by: T3 Code points the SDK
  at the person's own `claude` anyway, so it faces the same version skew; A answers it with a minimum version, parsing
  that ignores the unknown, and recorded frames. C was weighed and loses to A on every side: it is A plus an MCP server.

**Verdict: A.** A new ADR replaces ADR 0017's approval route. Our own small protocol module, in `arden-agents`; no
community crate.

### Q2. The vendor's rules, and the agent's name

- **Product:** P1 ADR 0003 already says it: the person's own CLI and the person's own sign-in. P4 T3 Code names the
  agent "Claude"; Claude Desktop says "Claude Code" for its own tab.
- **Experience:** E5 "Claude is replying…" reads better than "Claude Code is replying…", and the agent is Claude.
- **Architecture:** A1 two concepts were sharing one name: the **agent** (Claude) and its **agent CLI** (Claude Code,
  `claude`). The glossary splits them.
- **Reliability:** R3 Arden Code still never reads, stores or passes on a token; subscription and API-key users are the
  same to it, because the environment passes through unread.
- **Delivery:** D3 the Agent SDK's branding rules allow "Claude" in an agents menu and forbid "Claude Code" as the
  agent's name; the Legal page allows saying in plain text that a product runs Claude Code. Following the stricter rule
  costs nothing. The tagline stays: it is a plain-text statement of what Arden Code works with.

**Verdict:** keep ADR 0003's position and write `docs/vendors.md`. The agent is **Claude**; **Claude Code** (`claude`)
is its agent CLI, named in plain sentences.

### Q3. What the plan covers

- **Product:** P2 wants parity with the terminal: approvals, questions, carrying on after a restart, and **"always
  allow"**: in the terminal it is the most used answer after "yes", and without it every `npm test` asks again. P3 needs
  an "Open folder" inside the app and plain guidance when `claude` is missing or signed out. P5 accepts "always allow"
  because it is one more button that echoes Claude Code's own suggestion back; the CLI writes the rule, not Arden Code.
- **Experience:** E1 a Claude that cannot ask permission is read-only, which is not the product. E3 approvals and
  questions must work by keyboard and screen reader from the first version.
- **Architecture:** A2 resuming after a restart is a promise saving sessions (ADR 0035) already made; without it, the
  next message would start a new conversation.
- **Reliability:** R3 the trust step (Q5) belongs in the first version, not later.
- **Delivery:** D1 everything listed fits as vertical tickets; D5 nothing listed needs a protocol feature newer than the
  minimum version (Q12).

**Verdict. In:** Claude sessions in the Playground and folder projects; streamed text, thinking, tool calls, file
changes and errors; Stop; approval requests (Allow, Always allow when Claude Code suggests a rule, Deny); Claude's
questions; carrying on after a restart; trusting a project; choosing the agent and the project, and Open folder;
notifications while Claude waits; Settings → Agents with version, minimum version and sign-in. **Later:** choosing the
model, effort or permission mode (every session starts in `default`, passed explicitly); attachments; slash-command
menus; cost and usage; nested subagent views; linked sessions handing context to Claude; raw mode; Codex.

### Q4. One `claude` per session, or one per turn

- **Product:** P2 follow-ups must start at once, and background shells must survive between turns, as in the terminal.
- **Experience:** E1 a pause before every reply would feel broken.
- **Architecture:** A5 Codex's app-server is long-lived too; one shape for both.
- **Reliability:** R4 an idle `claude` holds memory, so it must not live for ever. R5 per turn kills background shells
  five seconds after each reply and runs `SessionStart` hooks every turn.
- **Delivery:** D4 one long-lived child per session is easy to see in the log.

**Verdict: long-lived.** Started by a session's first message, ended when the session is archived or deleted, when
Arden Code closes (the job), or after 10 minutes with no turn running and nothing heard from Claude. The next message
starts it again with `--resume`.

### Q5. Trusting a project

Options: (a) ask once per project before Claude first runs there; (b) run untrusted projects with
`--setting-sources user`; (c) opening a folder is trusting it.

- **Product:** P2 one question per project is the terminal's own behavior. P4 VS Code and Claude Code both ask. P3 needs
  to be told what trusting means.
- **Experience:** E5 the dialog says what Claude Code will run: the project's hooks, MCP servers and environment. E1 (b)
  is a half state that is hard to explain.
- **Architecture:** A2 trust is a fact about a project, stored with it. The Playground is Arden Code's own empty folder
  and needs no question.
- **Reliability:** **R3 for (a), firmly:** under `-p` a project's hooks run with no trust check, and T3 Code leaves this
  open. Rust refuses to start Claude in an untrusted project too, so the UI cannot be bypassed. Reading Claude Code's own
  trust records in `~/.claude.json` was weighed and refused: that file also holds account details, and its format is
  Claude Code's to change.
- **Delivery:** D5 (a) is one flag and one dialog.

**Verdict: (a).** The question comes when a message would start Claude in a project not yet trusted; Cancel leaves the
message in the box.

### Q6. Which title bar buttons lose the pointer

- **Product:** P1 asked for "the window title buttons": the window buttons.
- **Experience:** E4 Windows' own caption buttons show the arrow. E1 the menu, Back and Forward, the search strip and the
  layout toggles are the app's controls and keep the pointer that ADR 0032 gave every control. E2 today Maximize already
  shows the arrow (the Snap Layouts overlay's class cursor) while Minimize and Close show the hand: removing the
  pointer makes the three agree.
- **Architecture, Reliability:** a style rule and a test; nothing else moves.
- **Delivery:** D1 a small pull request of its own, before the Claude work.

**Verdict:** Minimize, Maximize or Restore, and Close show the arrow. A new ADR changes ADR 0032's pointer rule.

### Q7. `main` is never red

- **Product:** P1 asked for the rule in CLAUDE.md; nothing asked for other repositories.
- **Reliability:** R1 `main` went red twice on 2026-10-02 after green pull requests, both times from one screenshot test
  that failed one run in 8 to 20 (#61). So the rule names flaky tests, and asks for new or changed end-to-end and
  screenshot tests to run 10 times before a merge.
- **Delivery:** D2 a rule people can forget is half a rule: GitHub's branch protection makes `main` take only pull
  requests whose "Check (Windows)" and "Audit" passed on a branch up to date with `main`. The owner keeps the
  administrator's way around it for emergencies.

**Verdict:** the rule goes at the top of this repo's CLAUDE.md, and branch protection is switched on.

## Round 2

### Q8. Starting a Claude session

- **Product:** P2 a new session should stay in the project at hand. P3 must be able to try Claude without a project.
  P4 T3 Code and Claude Desktop choose both in the composer.
- **Experience:** E1 ADR 0032 left the message box's lower line for exactly this: the agent and the project become two
  menu buttons while the session is empty, and plain text after its first message. E4 Ctrl+O opens a folder, as in
  every Windows app.
- **Architecture:** A1 a session keeps one agent and one project (the glossary), so both are chosen while it is empty.
  A4 no new setting: the agent for a new session is the agent of that project's latest session, else of the latest
  session anywhere, else Claude when `claude` is installed, else the Demo agent.
- **Reliability:** R3 the Playground is Arden Code's own empty folder, safe for Claude.
- **Delivery:** D1 the agent menu ships with the first Claude ticket; the project menu and Open folder with their own.

**Verdict:** both menus in the message box while a session is empty. New session (Ctrl+N) starts in the open session's
project with the rule above. Open folder (Ctrl+O) adds a folder as a project and starts a session in it. Claude may
work in the Playground. The terminal command uses the same rule for the agent.

### Q9. Approval requests

- **Product:** P2 the terminal's answers: Yes, Yes and don't ask again, No. Its No stops Claude and waits for what to do
  instead. P4 every other app shows the request inside the reply.
- **Experience:** E1 an inline card under the tool call, with what Claude wants to do in our words (Run a command,
  Edit a file, Create a file, Open a web page, Search the web, Use a tool) and the specifics (the command, the path and
  the change, the address). After the answer it folds to a quiet line ("You allowed …"). E3 no focus jump while the
  person types; the request is announced politely and at once, the card is the last stop before the message box on
  Shift+Tab, and the status bar says Claude is waiting. E5 buttons: Allow, Always allow, Deny.
- **Architecture:** A1 an approval request is an item of its own, tied to its tool call. A3 a new command answers it;
  the item's change travels like any other item.
- **Reliability:** R2 an approval waiting when the app closes ends as cancelled with its turn. R5 Stop, archive and
  delete answer a waiting request with a denial and stop the reply.
- **Delivery:** D4 desktop notification when Claude waits and the window is not focused (ADR 0029 waited for this).

**Verdict:** as above. Deny stops the reply, as in the terminal. Always allow appears only when Claude Code suggests a
rule, and echoes it back.

### Q10. Claude's questions

- **Product:** P2 Claude asks these often while it plans. P5 one card, no previews.
- **Experience:** E1 each question with its options (radio buttons, or check boxes when several may be chosen), an
  "Other" field, and Send answers. E3 each question is a labeled group. E5 the glossary needs a word: **question**.
- **Architecture:** A1 a question is an item, not an approval request: it asks to choose, not to allow.
- **Reliability:** R5 Stop cancels a waiting question.
- **Delivery:** D1 its own ticket, after approvals, which it shares plumbing with.

**Verdict:** as above.

### Q11. Test seams

- **Reliability:** R1 the highest seam is the existing one: the store running a driver, as the Demo agent's tests do.
  The Claude driver starts its process through a launcher; tests give it a launcher whose "process" is a script of
  frames to expect and frames to play (T3 Code's fixture shape). A stand-in `claude` program in the workspace covers
  the real process path once (pipes, the job, ending). The UI is tested with mocked IPC, as now. One end-to-end test runs
  the real app against the stand-in on `PATH`.
- **Delivery:** D3 a signed-out probe of the real Claude Code 2.1.286 is kept, redacted, as a fixture. Recording signed-in
  sessions needs the person's sign-in, which Arden Code must never handle; an ignored test runs against a real, signed-in
  `claude` when the maintainer asks for it.

**Verdict:** as above.

### Q12. The minimum Claude Code version

- **Reliability:** R1 everything the driver uses (`stream-json` both ways, `--permission-prompt-tool stdio`,
  `--session-id`, `--resume` from any folder, `interrupt`) is documented by 2.1.223, which also includes the fix for
  unreadable stdin on Windows (2.1.211).
- **Delivery:** D5 a floor much above that blocks people for nothing; the shapes were checked against 2.1.286.

**Verdict:** 2.1.223. Older versions get a clear message and `claude update`.

### Q13. npm installs on Windows

- **Reliability:** R3 a session id or a model name is untrusted text, and our supervisor never passes untrusted text to
  a `.cmd` (ADR 0028). The npm package's `bin` is a real `claude.exe` at a fixed place next to npm's wrapper.
- **Product:** P3 many people install with npm.

**Verdict:** follow `claude.cmd` to `node_modules\@anthropic-ai\claude-code\bin\claude.exe` when a real program is
there; otherwise ask for the native installer. The wrapper's text is never parsed.

### Q14. Branches and pull requests

- **Delivery:** D1, D2 the two small requests share one branch and pull request, a commit and an issue each. The Claude
  tickets share one branch and one pull request, opened as a draft at the first push so CI runs on every ticket; each
  issue closes once its commit is green.

**Verdict:** as above.

## Round 3: smaller decisions, settled by consensus

| # | Question | Verdict and why |
|---|---|---|
| 15 | Permission mode, settings, model, system prompt | `--permission-mode default` always (otherwise Claude Code may start in `auto`). The person's own settings, CLAUDE.md, skills, hooks and MCP servers load, in a trusted project. No `--model`: Claude Code's own default. No appended system prompt. No `--bare`. |
| 16 | The child's environment | Inherited, minus the variables that tie a process to a Claude Code session above it (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and the child-session and messaging ones), so Arden Code started from a Claude Code terminal still works. Arden Code does not claim to be an SDK. |
| 17 | What is logged | Claude Code's errors (stderr) go to the child's log, as ADR 0028 says. The protocol on stdout holds the conversation, including file contents, and is not copied to the log; the type of each frame is logged at debug level. |
| 18 | Starting and resuming a Claude session | Arden Code makes the session's UUID and starts with `--session-id`; once Claude has answered under it, later starts use `--resume`. If Claude Code cannot find it, the session carries on in a new conversation and says so. |
| 19 | Stop | The `interrupt` request. The turn is marked stopped at once, as now; frames that arrive for it afterwards are ignored, and the next message waits for Claude to finish the interrupted turn. |
| 20 | What becomes items | Text and thinking stream from partial messages and are settled by the complete message. Tool calls from tool-use blocks, ended by their results. File changes from the results of Edit, Write and NotebookEdit (lines added and removed from the patch; Write says create or update). A subagent's own frames are not shown; its tool call is. Errors from the result. |
| 21 | Signed out, missing, too old | Each has an error code, plain words and what to do: install Claude Code, run `claude update`, or open a terminal, run `claude` and sign in with `/login`. Arden Code never offers a sign-in of its own. |
| 22 | Settings → Agents | Version, the minimum version, and sign-in from `claude auth status --json` (`loggedIn`), with no email shown. Detection runs once in the background after start, is kept, and refreshed with Look again. |
| 23 | Notifications | When an approval request or a question waits and the window is not focused. Not for finished replies. |
| 24 | Status bar | "Claude is replying…", "Claude is waiting for your answer". |
| 25 | Archive and delete | Both stop a running reply and end the session's `claude`. Deleting a Claude session says that Claude Code keeps its own copy of the conversation in its folder; Arden Code never touches Claude Code's files. |
| 26 | Linked sessions | A new, empty Claude session in the same project, with its own conversation; nothing is handed over (ADR 0036). |
| 27 | Welcome state | "What should Claude work on?", or the Demo agent when it is chosen; the line about real agents coming goes. |
| 28 | Error codes | New `ARD-AGT` codes for: Claude Code missing, too old, signed out, stopped unexpectedly, answering in a way Arden Code does not understand, an untrusted project, an npm install that cannot be started safely, and Claude being unable to answer (its own API errors). |

## Round 4: before the merge (2026-10-04)

Held after the ten tickets were built, against the code review of pull request #88.

| # | Question | Verdict and why |
|---|---|---|
| 29 | A request still waiting when Arden Code closes | The build had dropped Q9's verdict: such a request was lost with its turn, and ADR 0039 had been changed to say so. R2 held to the verdict; R4 found the cost negligible, since requests are rare; R1's worry about writing during a reply was settled by a store test that reopens the file around a waiting request. **Verdict:** a reply is written when it ends, and also when a request starts waiting; a turn read back as over settles what was under way (a running tool stopped, a waiting request cancelled). ADR 0039 says so again. |
| 30 | The review's open gaps | R1: the choice of whether to notify becomes a function of its own (`send_when_away`), tested with the existing recorder. R1 and R5: the stand-in notes when its input closes, and an end-to-end test sees that archiving a Claude session ends its Claude Code (10 of 10 runs). |
| 31 | Notification words written in Rust | E5 wants every word in the language file; A3 notes Rust cannot reach it, and the test notification already writes its words in Rust; P5 notes English is the only language. **Verdict:** kept, and noted in ADR 0039: a second language moves them to the page. |
| 32 | How the pull request is merged | D2: with a merge commit, as #76 was, once CI passed on its latest commit on a branch up to date with `main`, and the branch is deleted. |
