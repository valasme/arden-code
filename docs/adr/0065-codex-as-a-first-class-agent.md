# 0065. Codex as a first-class agent

- Status: Accepted
- Date: 2026-11-11
- Extends [0017](0017-agent-integration-direction.md), the session choices of
  [0039](0039-working-with-claude.md) and [0041](0041-choosing-how-a-session-starts.md), and the
  multi-agent direction of [0053](0053-plugins-through-the-agent-cli.md).
- Replaces ADR 0053's expectation that Codex plugin management necessarily ships with its first
  driver with the production-API and release-probe gate below.
- Changes plan sections 5.8 and 6.13. This is an accepted design, not completed implementation.

## Context

The maintainer asked for Codex support and delegated the open product questions to
[the councils](../research/codex-support-councils.md). Detection alone is not a working coding agent.
Literal Claude parity would also promise controls Codex may not implement. Current OpenAI
app-server documentation identifies some plugin-management methods as unsuitable for production
clients, so their presence cannot by itself make them a release requirement.

## Decision

- **First-class sessions, not text-only chat.** Codex uses the person's own `codex app-server`, through
  the existing process supervisor and driver/store seam, with JSON-RPC over stdio as ADR 0017 chose.
  No JavaScript runtime, third-party agent SDK or alternate credential flow is introduced.
- **Core scope:** the Playground and trusted folder projects; saved turns and restart/resume; streamed
  text and exposed reasoning; tool calls/file changes; approvals and supported questions; Stop;
  model/effort selection; supported native permission controls; install/version/sign-in guidance;
  reported context-window and usage-limit figures; skill discovery and supported invocation.
- **Shared experience, agent-specific capabilities.** Reuse the session view and control patterns.
  Use Codex's own reported choices and defaults. Do not apply Claude-only Ultrathink or invent
  equivalences between approval policy, sandbox policy and planning. Verify the exact control
  mappings against a real release before implementing them. Unsupported controls are unavailable,
  never silently reinterpreted to grant greater authority.
- **Preserve safety.** Check project trust in Rust before execution. Credentials remain with the
  person's CLI; Arden Code neither reads credential files nor supplies tokens. Do not log protocol
  stdout. Unknown permission/approval requests fail closed. Bypass remains explicitly gated, off by
  default and never inherited. Stop affects its own turn, not unrelated sessions.
- **Preserve session identity and data.** Keep the CLI's returned conversation id as an opaque value.
  Do not silently replace a missing saved conversation. Agent and project lock after the first
  message; linked sessions start empty. Archive/delete ends Arden's work without deleting the CLI's
  own history. Keep the existing default-agent precedence, adding available Codex before Demo when
  no prior session selects an agent and Claude is unavailable.
- **Plugins are a gated part of the integration.** Extend the existing Plugins page through Codex's
  own supported commands once the public production API and a release-matched probe permit it.
  Core sessions do not wait for that gate. Do not directly edit vendor configuration or copy skills
  as a workaround. Skills have their own capability checks, separate from plugin installation.
- **Outside this build:** raw mode, attachments, importing existing CLI conversations, nested
  subagent views and transferring conversation context into linked sessions.
- **Evidence before implementation claims.** Establish the CLI version, generated schema and
  handshake; derive the minimum supported version from exercised behavior, not a guess. Use
  deterministic driver/store tests and a stand-in for real-process/end-to-end coverage on Windows
  and Linux. Keep a real signed-in smoke test distinct from stand-in results.

## Consequences

- The integration is split into dependency-linked vertical tickets after protocol research and a
  spec, built test-first and reviewed on separate Standards and Spec axes.
- Optional or experimental APIs do not block safe core sessions, and unavailable features are
  reported honestly. Plugin parity is not claimed while its production gate remains closed.
- No runtime topology, minimum version or successful Codex execution is asserted by this ADR.
  Those need actual release-matched evidence before the relevant implementation is accepted.
- The agent-logo decision is independent, recorded in
  [0064](0064-vendor-logos-for-agent-identification.md).
