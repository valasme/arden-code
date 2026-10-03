# 0038. Claude through its own protocol

- Status: Accepted
- Date: 2026-10-03
- Changes the Claude part of [0017](0017-agent-integration-direction.md) (how approvals come back), the log of an
  agent's protocol in [0028](0028-process-supervisor.md), and plan section 5.8.

## Context

ADR 0017 chose the person's own `claude` in headless streaming mode, with approvals sent to an MCP permission tool that
Arden Code would host. Before building it, [the research](../research/claude-agent.md) read T3 Code, Anthropic's
Agent SDKs and Claude Code's documentation, and probed the real Claude Code 2.1.286:

- T3 Code runs Claude through Anthropic's TypeScript Agent SDK, pointed at the person's own `claude`.
- The SDK is a thin client. It speaks JSON lines with `claude` over stdin and stdout, and a control protocol on top:
  approval requests and Claude's questions arrive as `can_use_tool` requests and are answered on stdin
  (`--permission-prompt-tool stdio`), and a reply is stopped with an `interrupt` request. Both official SDKs work this
  way; neither uses an MCP permission tool.
- Anthropic's documentation sends languages other than Python and TypeScript to the CLI as a subprocess. There is no
  Rust SDK; the community crates are lightly used, and one points to an Anthropic repository that does not exist.
- Under `-p`, Claude Code shows no trust dialog: a project's hooks and MCP servers run without asking (ADR 0039).

Every option was weighed by [the councils](../research/claude-agent-councils.md).

## Decision

- **Arden Code speaks the protocol itself, in Rust.** The Claude driver in `arden-agents` starts the person's own
  `claude` with `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages
  --permission-prompt-tool stdio --permission-mode default`, and `--session-id` or `--resume`. No SDK, no community
  crate, no JavaScript runtime and no MCP server.
- **Approvals, questions and Stop travel on the same pipes.** A `can_use_tool` request becomes an approval request or a
  question in the reply (ADR 0039), answered with a `control_response`. Stop sends `interrupt`.
- **One `claude` per session, kept while it is used.** It starts with the session's first message and ends when the
  session is archived or deleted, when Arden Code ends (the job), or after 10 minutes with no turn running and nothing
  heard from it. The next message starts it again with `--resume`.
- **Finding `claude`** follows ADR 0028. When `PATH` holds only npm's `claude.cmd`, the driver uses the npm package's own
  `node_modules\@anthropic-ai\claude-code\bin\claude.exe` beside it, without reading the wrapper; when that is not a
  real program, it asks for Claude Code's native installer. Untrusted text never reaches a `.cmd`.
- **Claude Code 2.1.223 or later.** Everything the driver uses is documented by then. Frames and fields the driver does
  not know are ignored, so a newer Claude Code keeps working.
- **The person's own Claude Code, unchanged.** No `--bare`, no `--model` and no appended system prompt: their settings,
  CLAUDE.md, skills, hooks and MCP servers load as in their terminal, in a trusted project. The environment is
  inherited, minus the variables that tie a process to a Claude Code session above it (`CLAUDECODE`,
  `CLAUDE_CODE_ENTRYPOINT` and the child-session and messaging ones), so Arden Code started from inside Claude Code
  still starts a session of its own. Arden Code does not present itself as an SDK.
- **The conversation's id is Arden Code's.** It makes a UUID for each Claude session and starts with `--session-id`.
  Once Claude has answered under it, later starts use `--resume`. If Claude Code cannot find the conversation, the
  session carries on in a new one, and a line in the reply says so.
- **What is logged.** Claude Code's error output goes to the child's log, as ADR 0028 says. Its standard output is the
  conversation itself, file contents included, so it is not copied there: the type of each frame is logged at debug
  level, and nothing else.
- **Tests.**
  - The store runs the Claude driver as it runs the Demo agent, with a launcher whose process is a script of frames to
    expect and frames to play.
  - A stand-in `claude` program in the workspace covers the real process path and the end-to-end test.
  - A probe of the real Claude Code 2.1.286, signed out and with no API call, is kept, redacted, as a fixture.
  - An ignored test runs against a real, signed-in `claude` when the maintainer asks for it. Arden Code never signs in.

## Consequences

- Arden Code owns a protocol client and keeps it up to date. The minimum version, the tolerant parsing and the
  recorded frames guard it.
- No JavaScript runtime, no npm package in the core path, and one process per open Claude session. Codex will reuse
  the piped child and the line reading.
- If Claude Code makes `--bare` the default for `-p`, as its documentation announces, the driver has to opt out, or
  the person's sign-in stops working.
