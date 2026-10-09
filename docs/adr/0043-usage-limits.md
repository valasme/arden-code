# 0043. Usage limits

- Status: Accepted
- Date: 2026-10-09
- Changes the "everything the driver uses is documented" line of [0038](0038-claude-through-its-own-protocol.md) for
  one request, the "later" list of [0039](0039-working-with-claude.md), and plan sections 5.8, 6.1, 6.3, 6.12 and 13.

## Context

A person working with Claude on a Claude plan runs into its 5-hour and weekly limits, and today learns of them only
when a reply is refused. [The research](../research/usage-limits.md) found that Claude Code reports both: a public
`rate_limit_event` frame during a turn, one window at a time, and an experimental `get_usage` control request that
answers with both windows and their reset times, with no message to the model. [The councils](../research/usage-limits-councils.md)
weighed each choice.

## Decision

- **Usage limit** is a term of its own (the glossary). "Usage" alone already means telemetry (ADR 0003).
- **Only the 5-hour limit and the weekly limit** are shown: a percentage used and a reset time each. Per-model weekly
  windows, extra usage, context and cost are not.
- **The numbers come from the person's own Claude Code.** The driver sends `get_usage` with `skip_behaviors`, and reads
  `rate_limit_event` frames. Arden Code never calls Anthropic and never sees a token; Claude Code asks with its own
  sign-in.
- **`get_usage` is used though the SDK marks it experimental.** It is the only way to show both windows before a reply.
  The meter is information, not control: an error, a missing field or an unknown shape reads as "not reported" and never
  stops a reply. This is the one exception to ADR 0038's rule that the driver uses only documented, stable frames.
- **When it asks:** after `initialize` in the Claude Code started in the Playground at each start (ADR 0042); when a
  Claude reply ends; on Look again in Settings → Agents; and when the window regains focus with an answer more than
  5 minutes old. Never more than once a minute.
- **Where it shows:** the status bar, as text ("5-hour 42% · Weekly 18%"); Settings → Agents, with the reset times.
  From 80%, or Claude Code's warning, a figure is emphasized; at the limit it says when the window resets. Nothing is
  added to the session view, and no notification is sent.
- **A setting,** Show usage limits [on], in Settings → Agents. Off, Arden Code neither asks nor shows.
- **Memory only.** The figures are never written to disk.

## Consequences

- People on a Claude plan see how close they are to a limit before they reach it, without leaving Arden Code.
- If Claude Code changes or removes `get_usage`, the status bar falls back to what `rate_limit_event` reports, or to
  nothing. The fixture and the signed-in test show it.
- Claude Code makes a call to Anthropic when Arden Code asks it; plan section 13 says so.
- The vendors page carries a dated note, checked again before a release.
- Codex fills the same shape when its driver is written.
