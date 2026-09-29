# 0017. Agent integration direction

- Status: Accepted
- Date: 2026-09-29

## Context

Arden Code will support Claude Code and Codex. Cursor was dropped. The options considered:

- **Agent Client Protocol (ACP):** it mainly helped with Cursor; Claude and Codex would both need adapters.
- **Codex:** its official `codex app-server` (JSON-RPC over stdio) is what OpenAI's own clients use.
- **Claude, via the `claude` CLI:** headless mode streams JSON in both directions, and approval prompts can go to an MCP tool (`--permission-prompt-tool`).
- **Claude, via Anthropic's TypeScript Agent SDK:** it needs a bundled JavaScript runtime, and drives the same CLI anyway.
- **Anthropic's terms:** they changed repeatedly in 2026. Running the user's own `claude` binary is ordinary use.

## Decision

- **Interface:** one `AgentDriver` trait with these operations: start or resume, send a turn, stream items, answer approvals, cancel.
- **Codex:** a driver for `codex app-server`.
- **Claude:** a driver for the user's installed `claude` CLI in headless streaming mode. Approvals are routed through an MCP permission tool that Arden Code hosts.
- **Raw mode (later):** an embedded terminal (ConPTY + xterm.js) running the vendor's own terminal UI.
- **Not used:** ACP, and Anthropic's TypeScript Agent SDK.
- **In the foundation:** only the vendor-neutral pieces.
  - The process supervisor: Job Objects, PATH/PATHEXT resolution, and safe handling of `.cmd` wrappers.
  - Read-only detection of `claude` and `codex`.
  - The Demo driver.

## Consequences

- There are two protocols to maintain, but both are the vendors' own interfaces.
- No JavaScript runtime is bundled, and Arden Code never handles credentials.
