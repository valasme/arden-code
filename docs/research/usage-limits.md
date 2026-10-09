# Claude's usage limits: research

- Date: 2026-10-09
- Question: what does Claude Code tell Arden Code about the person's 5-hour and weekly usage limits, on the pipes the
  driver speaks (ADR 0038), and what does it cost to ask?
- Read at: Claude Code 2.1.295, probed signed out with the driver's own flags and no message; the strings of its
  program; the TypeScript Agent SDK's published types (`@anthropic-ai/claude-agent-sdk` 0.3.295); and the
  [vendors page](../vendors.md).

## The answer in short

- **Claude Code reports usage limits two ways, and neither needs a message to the model.**
  - A `rate_limit_event` frame, public in the SDK's types, "emitted when rate limit info changes" during a turn. It
    names one window at a time. [TS]
  - A `get_usage` control request, in the SDK's types too, answered with both windows, each as a percentage and a reset
    time. It is marked experimental. [TS] [PROBE]
- **Signed out, or with an API key, there are no limits to report.** `get_usage` answers with
  `rate_limits_available: false` and `rate_limits: null`. [PROBE]
- **Arden Code never sees a token.** Claude Code asks Anthropic with its own sign-in and hands back numbers. [TS]

## `rate_limit_event`

- **Shape:** `{"type":"rate_limit_event","rate_limit_info":{…},"uuid":…,"session_id":…}`. [TS]
- **`rate_limit_info`:** [TS]
  - `status`: `allowed`, `allowed_warning` or `rejected`
  - `rateLimitType`, optional: `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`,
    `seven_day_overage_included` or `overage`
  - `utilization`, optional: the share of the window used
  - `resetsAt`, optional: when the window resets, in Unix seconds
  - overage fields (`overageStatus`, `isUsingOverage` and others) and `surpassedThreshold`
- **An internal `unifiedWindows` field** carries both windows at once, read from the API's
  `anthropic-ratelimit-unified-*` headers. It is marked `@internal` and is not in the SDK's types. [BIN]
- **Claude Code's own thresholds** for warning are 90% of the 5-hour window and 25%, 50% and 75% of the weekly one,
  each weighed against how much of the window has passed. [BIN]
- **The driver ignores the frame today**, as it does every frame it does not know (`protocol.rs`). [CODE]
- **Not seen signed in.** Whether every turn carries a `utilization`, or only turns near a threshold, needs a probe
  with a signed-in `claude`. Until then, a frame without one only says the status.

## `get_usage`

- **Request:** `{"type":"control_request","request_id":…,"request":{"subtype":"get_usage","skip_behaviors":true}}`.
  `skip_behaviors` skips a scan of the last seven days of local transcripts, "for callers that need only the plan
  rate limits, such as a usage meter". [TS] [BIN]
- **Answer:** [TS] [PROBE]
  - `subscription_type`: `pro`, `max`, `team`, `enterprise`, or null for an API key or a cloud provider
  - `rate_limits_available`: false when plan limits do not apply
  - `rate_limits.five_hour` and `rate_limits.seven_day`, each `{utilization, resets_at}`: a percentage from 0 to 100
    and an ISO 8601 time, either of which may be null
  - also per-model weekly windows (`seven_day_opus`, `seven_day_sonnet`, `model_scoped`), `extra_usage`, and the
    session's cost totals
- **Experimental.** The SDK names its method `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` and says it
  "may change or be removed in any release without notice". [TS]
- **Works under `-p`.** Sent after `initialize` to a signed-out Claude Code started with the driver's flags, with no
  message, it answered at once:
  `{"session":{"total_cost_usd":0,…},"subscription_type":null,"rate_limits_available":false,"rate_limits":null,"behaviors":null}`.
  [PROBE]
- **Not advertised.** `initialize` lists no capability for it. A Claude Code without it answers the request with an
  error, as it does every subtype it does not know. [PROBE] [BIN]
- **Where the numbers come from:** Claude Code's call to the claude.ai usage endpoint, with the person's own sign-in.
  An answer may be served from Claude Code's cache. [TS]

## Other ways, turned down

- **The status line's `rate_limits`.** Claude Code passes `rate_limits.five_hour.used_percentage` and `seven_day` to a
  status-line command. Using it means changing the person's Claude Code settings, which ADR 0038 rules out. [BIN]
- **Calling Anthropic's usage endpoint from Arden Code.** It needs the person's token, which ADR 0003 forbids.
- **Running `/usage` as a message.** A local command, so no model turn, but the answer is text for a terminal, not data.

## Vendor terms

- [The vendors page](../vendors.md), checked on 2026-10-03: products built on the Agent SDK "may not offer Claude.ai
  sign-in or its usage limits unless Anthropic approved it". That line is about letting people spend their plan through
  another product. Arden Code already runs the person's own Claude Code on their own plan; reading back what that
  Claude Code reports about the plan offers nothing new.

## Sources

- [TS] `@anthropic-ai/claude-agent-sdk` 0.3.295, `sdk.d.ts`: `SDKRateLimitEvent`, `SDKRateLimitInfo`,
  `SDKControlGetUsageRequest`, `SDKControlGetUsageResponse` and `Query.usage_EXPERIMENTAL_…`.
- [PROBE] Claude Code 2.1.295, signed out, started with `-p --input-format stream-json --output-format stream-json
  --verbose` and sent `initialize`, then `get_usage`. No message, so no call to the model.
- [BIN] The strings of the Claude Code 2.1.295 program: the schema of `rate_limit_info`, its warning thresholds, and
  the description of `get_usage`.
- [CODE] Arden Code at `2e21e69`.
