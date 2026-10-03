# Claude as the first real agent: research

- Date: 2026-10-03
- Question: how should Arden Code run Claude? What does T3 Code use, and is that the best method for us?
- Read at: T3 Code at `f391794` (2026-10-03), the Python Agent SDK at `68db221` (v0.2.163), the TypeScript Agent SDK's
  published types (`@anthropic-ai/claude-agent-sdk` 0.3.288), Claude Code 2.1.286's `--help`, and the Claude Code docs
  on the date above.

## The answer in short

- **T3 Code** runs Claude through Anthropic's TypeScript **Claude Agent SDK**, pointed at the user's own `claude`
  (its binary path setting defaults to `claude`, found on `PATH`). Its backend is Node, so the SDK fits it. Codex goes
  through `codex app-server`, as our plan already says. [T3]
- **The SDK is a thin client.** It starts `claude` with JSON lines in both directions (`stream-json`) and speaks a
  control protocol over stdin and stdout. Approval requests, Claude's questions, stopping a reply, and changing the
  permission mode or the model all travel over it. [PY] [TS]
- **For Arden Code, the best method is T3 Code's minus the JavaScript:** a Rust driver that speaks the same protocol
  to the user's own `claude`. Anthropic's docs point languages other than Python and TypeScript at running the CLI as
  a subprocess. [SDK]
- **This keeps the direction of ADR 0017** (the user's own agent CLI, headless, `stream-json`) **and changes one
  part:** approvals come back over stdio (`--permission-prompt-tool stdio`, what both official SDKs do), not through
  an MCP permission tool that Arden Code would host.

## What T3 Code does

All paths are in `pingdotgg/t3code` at `f391794`. [T3]

- **The adapter:** `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` (7,758 lines) uses `query` from
  `@anthropic-ai/claude-agent-sdk` (`^0.3.276` in `apps/server/package.json`).
- **One long-lived query per session.** It is fed from a queue of user messages (the SDK's streaming input), with:
  - partial messages on, so text streams token by token
  - a `canUseTool` callback for approvals
  - `interrupt()` to stop a reply, `setModel()` to switch models
  - the SDK's `forkSession`
- **T3 Code chooses Claude's session id.** A new session passes `sessionId`; once Claude has the session, later
  starts pass `resume` with the same id (`makeClaudeQueryOptions`).
- **The system prompt** is Claude Code's own preset with a short block appended. Thinking summaries are on.
- **Which binary:** the setting defaults to `claude` (`packages/contracts/src/settings.ts`). On Windows,
  `apps/server/src/provider/Drivers/ClaudeExecutable.ts` resolves it through `PATH` and `PATHEXT`, and follows npm's
  `claude.cmd` to `node_modules/@anthropic-ai/claude-code/bin/claude.exe`, because the SDK cannot start a `.cmd`.
- **The status check** (`apps/server/src/provider/Layers/ClaudeProvider.ts`):
  - runs `claude --version`
  - then opens an SDK session whose prompt never comes, reads the `initialize` answer (account, plan, slash
    commands) and ends it. No prompt reaches Anthropic's API.
- **Tests replay recorded sessions.**
  - A script records a real session (`apps/server/scripts/record-claude-agent-sdk-replay-fixture.ts`).
  - Each fixture (`testkit/fixtures/claude_*/claude_transcript.ndjson`) lists the frames the app must send
    (`expect_outbound`) and the frames the fake agent plays back (`emit_inbound`).
  - CI replays them with no network.
- **Not handled: workspace trust** (see Risks). Hooks are turned off only for the status check.

## What the official SDK sends to the CLI

The Python SDK is open source and does the same job as the TypeScript one, so it is the readable primary source. The
TypeScript SDK's `sdk.d.ts` describes the same messages. [PY] [TS]

### Starting the CLI

From `_internal/transport/subprocess_cli.py` and `types.py`:

- **The command line:** `claude --output-format stream-json --verbose [options] --input-format stream-json`.
  - With an approval callback, the SDK adds `--permission-prompt-tool stdio` (`_configure_can_use_tool`).
  - Other options it maps to flags: `--model`, `--permission-mode`, `--resume=<id>`, `--session-id=<id>`,
    `--include-partial-messages`, `--append-system-prompt`, `--effort`, `--setting-sources`, `--settings`,
    `--add-dir`, `--mcp-config`, `--fork-session`.
- **The environment:** it sets `CLAUDE_CODE_ENTRYPOINT` (`sdk-py`) and `CLAUDE_AGENT_SDK_VERSION`, and removes
  `CLAUDECODE`.
- **Which binary:**
  - its own bundled copy of the CLI first, then `claude` on `PATH`, preferring a real `claude.exe`
  - on Windows, also `%USERPROFILE%\.local\bin\claude.exe`, where the native installer puts it
- **On Windows it refuses to run a `.cmd` or `.bat` as the CLI.** `cmd.exe` would read the arguments as commands
  (BatBadBut, CVE-2024-27980). As a second guard, it rejects `cmd.exe` metacharacters in session ids. This is the rule
  our process supervisor already follows (ADR 0028).

### The control protocol

From `_internal/query.py` and `types.py`. Every line on stdin and stdout is one JSON object.

- **Arden Code to the CLI:**
  - **user messages:** `{"type":"user","message":{"role":"user","content":…},"parent_tool_use_id":null,"session_id":…}`
  - **control requests:** `{"type":"control_request","request_id":…,"request":{"subtype":…}}`
    - `initialize` is sent first
    - others include `interrupt`, `set_permission_mode`, `set_model`, `get_context_usage`, `rewind_files` and
      `stop_task`
- **The CLI to Arden Code:**
  - the stream messages (next section)
  - answers to our control requests: `{"type":"control_response","response":{"subtype":"success"|"error","request_id":…}}`
  - control requests of its own: `can_use_tool`, `hook_callback` and `mcp_message`
  - `control_cancel_request`, when it gives up on one of its own requests
- **`can_use_tool` carries:**
  - always: `tool_name`, `input` and `tool_use_id`
  - optionally: `permission_suggestions`, `blocked_path`, `decision_reason`, `title`, `display_name`, `description`
    and `agent_id`
- **Arden Code's answer** is one of:
  - `{"behavior":"allow","updatedInput":{…}}`, optionally with `updatedPermissions`, which echoes a suggestion back
    to remember the choice
  - `{"behavior":"deny","message":…}`, optionally with `interrupt`
- **Stdin stays open** while approvals can still arrive. Closing it makes the CLI's later requests fail.

### What comes out

From the headless docs, the TypeScript reference and `sdk.d.ts`. [HL] [TS]

- **`system` / `init` comes first.** It names the model, tools, MCP servers, permission mode, slash commands and
  `claude_code_version`. From 2.1.205 it also lists `capabilities`, for feature detection instead of comparing version
  numbers.
- **`stream_event`** carries raw Messages API streaming events when `--include-partial-messages` is on:
  `content_block_start`, `content_block_delta` and `content_block_stop`, with `text_delta`, `thinking_delta` and
  `input_json_delta`.
- **`assistant`** carries finished content blocks (`text`, `thinking`, `tool_use`).
- **`user`** carries the tools' results (`tool_result`). A subagent's messages carry the `parent_tool_use_id` of the
  tool call that started it.
- **`result`** comes once per turn: `subtype` (success or an error), `is_error`, `session_id`, `total_cost_usd`,
  `usage` and `permission_denials`.
- **Many more exist:** `system/api_retry`, `system/permission_denied`, `system/compact_boundary`,
  `system/session_state_changed`, `rate_limit_event`, `auth_status`, task and hook events. There are 36 message types
  in 0.3.288. A client has to ignore what it does not know.

## Official guidance that shapes the design

- **Other languages run the CLI as a subprocess** with `-p`. [SDK]
- **Permission checks run in a fixed order.** [PERM]
  - The order: hooks, deny rules, ask rules, the permission mode, allow rules, then the host's approval request.
  - The modes: `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions` and `auto`.
  - A session started with no mode can land in `auto`, where a classifier approves actions in place of the person.
    So a mode is always passed.
- **Claude's clarifying questions** (`AskUserQuestion`) arrive as a `can_use_tool` request. [UI]
  - Each call holds 1 to 4 questions, each with 2 to 4 options.
  - The answers go back in `updatedInput.answers`, keyed by the question's text.
  - Neither an approval nor a question has a time limit.
- **Sessions.** [SES] [HL]
  - `--session-id <uuid>` names a new session.
  - `--resume <id>` carries one on, from any folder on this machine (2.1.223 and later).
  - Transcripts live in `~/.claude/projects/<encoded folder>/<id>.jsonl`.
- **Stopping.** [HL]
  - The `interrupt` request ends the turn cleanly.
  - A process that is ended leaves its turn unfinished.
  - Closing stdin cancels an approval that is waiting.
- **`--bare` is recommended for scripts, and will become the default for `-p`.** It never reads the subscription
  sign-in, and skips CLAUDE.md, skills, hooks and plugins. Arden Code must not use it, and must opt out once it
  becomes the default. [HL]
- **`--permission-prompts none`** (2.1.259 and later) denies everything that would ask. [HL] [HELP]

## Anthropic's terms, as of 2026-10-03

From the Legal and compliance page and the Agent SDK overview. [LEGAL] [SDK]

- **Allowed:** a person signing in to the unmodified Claude Code binary with their own subscription, and a product
  saying in plain text that it runs Claude Code.
- **Not allowed:**
  - a third party offering Claude.ai sign-in
  - routing requests through Free, Pro or Max credentials on behalf of its users
  - collecting, storing or passing on Claude.ai credentials or tokens
  - Sign-in has to complete through Anthropic's own flow.
- **Products built on the Agent SDK** are pointed at API keys. The SDK page adds that third parties may not offer
  claude.ai sign-in or rate limits unless Anthropic approved it.
- **Naming** (Agent SDK page):
  - allowed: "Claude Agent", or "Claude" inside a menu already labeled Agents
  - not allowed: "Claude Code" as the agent's name, or visuals that mimic Claude Code
  - The Legal page separately allows saying in plain text that a product runs Claude Code.
- **Where Arden Code stands** (ADR 0003): it starts the person's own unmodified `claude`, never offers sign-in and
  never reads tokens. The usage is the person's own. That is the allowed side as the terms read today, and they
  changed several times in 2026.

## The options

| | Method | Approvals | What it costs Arden Code | Verdict |
|---|---|---|---|---|
| A | A Rust driver speaking `stream-json` and the control protocol to the person's `claude` | `--permission-prompt-tool stdio`, answered in the driver | A protocol client of our own, kept up with the CLI | **Recommended** |
| B | The TypeScript Agent SDK in a bundled Node or Bun process: T3 Code's exact method | The SDK's `canUseTool` | A JavaScript runtime, a second process and its IPC, and npm in the core path (ADR 0017, ADR 0020) | The same protocol underneath, with more machinery |
| C | `stream-json` with an MCP permission tool that Arden Code hosts: ADR 0017 today | `--permission-prompt-tool mcp__…` | An MCP server (a helper program, or HTTP on localhost) and fewer features: for example, `permission_denied` events don't cover it [TS] | Replaced by A |
| D | The Agent Client Protocol through an adapter | ACP | An extra adapter process between us and Claude; ADR 0017 turned it down | No |
| E | Raw mode only: the vendor's terminal interface in ConPTY | Claude Code's own interface | No session view, items or approval requests of our own | Later, as raw mode |
| F | A community Rust crate (`claude-codes`, `claude-agent-sdk-rs`, …) | Varies | Lightly used, single maintainers. The crate named `claude-agent-sdk` points to an Anthropic repository that does not exist [CRATES] | For reference only |

## Windows details

- **Where `claude` lives:**
  - **The native installer** (`irm https://claude.ai/install.ps1 | iex`) puts it at `%USERPROFILE%\.local\bin\claude.exe`.
    [PY]
  - **npm** makes `%APPDATA%\npm\claude.cmd`, which runs `node_modules\@anthropic-ai\claude-code\bin\claude.exe`
    (the package's `bin` in 2.1.288). [NPM]
- **The npm wrapper and our supervisor:** the supervisor refuses untrusted arguments for a `.cmd` (ADR 0028), and a
  session id or a model name counts as untrusted. So the driver either follows the wrapper to the real `claude.exe`, as
  T3 Code does, or asks for the native install.
- **The Claude desktop app** keeps its own copy at `%APPDATA%\Claude\claude-code\<version>\…\claude.exe`. It is not on
  `PATH`, and detection is right not to find it. (On this machine it is the only `claude`.)
- **Stopping and ending:** a child process with no window gets no Ctrl+C, so a reply is stopped with the `interrupt`
  request. The process is ended by closing its stdin, then by the job (ADR 0028).

## Risks

1. **The control protocol changes.** It is the SDKs' contract with the CLI, described by the SDKs' types rather than
   by a standalone spec, and it grows every few releases. Mitigations: a minimum version, checking `capabilities`,
   parsing that ignores what it does not know, and recorded sessions to test against.
2. **Workspace trust.** Under `-p`, a project's hooks, `env` block, `apiKeyHelper` and `.mcp.json` servers run with no
   trust dialog [PERM2]. In a terminal, Claude Code would ask first. T3 Code does not handle this.
3. **`--bare` becoming the default for `-p`** would break subscription sign-in until Arden Code opts out.
4. **The terms change** again.
5. **The person's `claude` version varies,** unlike the copy an SDK bundles.

## Sources

- [T3] T3 Code, <https://github.com/pingdotgg/t3code> at `f391794a35c6`: the files named above.
- [PY] Claude Agent SDK for Python, <https://github.com/anthropics/claude-agent-sdk-python> at `68db221ebe29`:
  `src/claude_agent_sdk/_internal/transport/subprocess_cli.py`, `_internal/query.py`, `types.py`, `client.py`.
- [TS] `@anthropic-ai/claude-agent-sdk` 0.3.288, `sdk.d.ts` (<https://cdn.jsdelivr.net/npm/@anthropic-ai/claude-agent-sdk@0.3.288/sdk.d.ts>),
  and the TypeScript reference, <https://code.claude.com/docs/en/agent-sdk/typescript>.
- [SDK] Agent SDK overview, <https://code.claude.com/docs/en/agent-sdk/overview>.
- [HL] Run Claude Code programmatically, <https://code.claude.com/docs/en/headless>.
- [PERM] Configure permissions (Agent SDK), <https://code.claude.com/docs/en/agent-sdk/permissions>.
- [PERM2] Configure permissions (Claude Code), section "What runs before you trust a folder",
  <https://code.claude.com/docs/en/permissions>.
- [UI] Handle approvals and user input, <https://code.claude.com/docs/en/agent-sdk/user-input>.
- [SES] Work with sessions, <https://code.claude.com/docs/en/agent-sdk/sessions>.
- [LEGAL] Legal and compliance, <https://code.claude.com/docs/en/legal-and-compliance>.
- [HELP] `claude --help`, Claude Code 2.1.286.
- [NPM] `npm view @anthropic-ai/claude-code` 2.1.288: `bin` and package files.
- [CRATES] crates.io API: `claude-agent-sdk`, `claude-codes`, `claude-agent-sdk-rs` and others; GitHub: no
  `anthropics/claude-agent-sdk-rust`.
