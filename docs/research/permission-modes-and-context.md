# Permission modes, the context window and the Claude logo: research

- Date: 2026-10-10
- Question: what does Claude Code let Arden Code do about a session's permission mode and its context window, on the
  pipes the driver speaks (ADR 0038)? And may Arden Code show Anthropic's Claude logo?
- Read at: Claude Code 2.1.292, probed signed in with the driver's own flags and no message; the TypeScript Agent SDK's
  published types (`@anthropic-ai/claude-agent-sdk`, `sdk.d.ts` and `sdk-tools.d.ts`, as published on 2026-10-10);
  Claude Code's `--help`; Anthropic's legal pages; and Arden Code at `71d0958`.

## The answer in short

- **Permission modes can be chosen at start and changed at any time, with no restart.** `--permission-mode` takes
  `manual`, `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions`; the `set_permission_mode` control request
  changes the mode of a running Claude Code, and a `system/status` frame reports every change. [HELP] [PROBE] [TS]
- **Bypass permissions needs a flag at start.** Claude Code refuses to switch into it unless it was started with
  `--allow-dangerously-skip-permissions` (or `--dangerously-skip-permissions`). [PROBE] [TS]
- **The context window is one request away, with no message to the model.** `get_context_usage` answers with the
  tokens used, the window's size, the point where Claude Code compacts, and a breakdown. [PROBE] [TS]
- **Plan mode ends with an approval request** for Claude Code's `ExitPlanMode` tool. The plan is saved to a file, and
  the answer can switch the mode. [TS]
- **Anthropic's logos need its written permission.** Naming Claude Code in plain text is allowed; any other use of
  Anthropic's names or logos is not, without a written yes. [LEGAL] [TM]

## Permission modes

- **The flag.** `--permission-mode <mode>`, with the choices `acceptEdits`, `auto`, `bypassPermissions`, `manual`,
  `dontAsk` and `plan`. The driver passes `default` today (ADR 0038): 2.1.292 still takes it and reports it as
  `default`; `manual` is the same mode under its new name, and `set_permission_mode` with `manual` answers
  `{"mode":"default"}`. [HELP] [PROBE]
- **What each mode does,** from the SDK's own comments: [TS]
  - `default`: the standard behaviour, asking before edits and commands;
  - `acceptEdits`: edits files without asking;
  - `plan`: "Planning mode, no actual tool execution";
  - `auto`: "Use a model classifier to approve/deny permission prompts";
  - `dontAsk`: "Don't prompt for permissions, deny if not pre-approved";
  - `bypassPermissions`: "Bypass all permission checks (requires `allowDangerouslySkipPermissions`)".
- **Starting in a mode.** Started with `--permission-mode auto`, the answer to `initialize` says
  `"current_permission_mode":"auto"`; started with `manual`, it says `"default"`. [PROBE]
- **Changing it.** `{"subtype":"set_permission_mode","mode":…}` is answered with `{"mode":…}` and followed by
  `{"type":"system","subtype":"status","status":null,"permissionMode":…}`. It worked for `acceptEdits`, `plan`, `auto`,
  `default`, `manual` and `dontAsk` on a Claude Code started in `manual`. It is documented and not marked experimental:
  `Query.setPermissionMode(mode)`, "Change the permission mode for the current session", in streaming input mode. [PROBE]
  [TS]
- **Bypass permissions.** On a Claude Code started without either flag, `set_permission_mode` with
  `bypassPermissions` is refused: `"Cannot set permission mode to bypassPermissions because the session was not
  launched with --dangerously-skip-permissions"`, `error_code: "bypass_not_launched"`. Started with
  `--allow-dangerously-skip-permissions`, which "enables bypassing all permission checks as an option, without it being
  enabled by default", the same request succeeds, and switching back to `default` works. [PROBE] [HELP]
- **Following the mode.** The `system/status` frame comes for every change, whoever made it: the host's request, or an
  answer that carries a `setMode` permission update (below). [PROBE] [TS]
- **Not checked:** which Claude Code version first took `auto` and `manual`. Arden Code's minimum is 2.1.223 (ADR 0038);
  an older Claude Code that does not know a mode fails to start, and the reply says so.

## Plan mode's end

- **The tool.** In Plan mode Claude ends by calling `ExitPlanMode`, which arrives as a `can_use_tool` request like any
  approval request. Its input schema has only a deprecated `allowedPrompts` field and is open
  (`[k: string]: unknown`); its output names `plan` ("The plan that was presented to the user") and `filePath` ("The
  file path where the plan was saved"). The plan text travels in the request's input as `plan`. [TS]
- **Answering it.** An allow answer may carry `updatedPermissions`, among them
  `{"type":"setMode","mode":…,"destination":"session"}`, which switches the mode as the plan starts. A deny answer
  carries a `message`; without `interrupt`, Claude carries on in Plan mode with it. [TS]
- **`EnterPlanMode`** has an empty input: Claude may ask to enter Plan mode itself. The `system/status` frame reports
  the change. [TS]
- **Today** Arden Code would show the request as "Use a tool" with the input as raw JSON (`approval.rs`). [CODE]
- **Not seen signed in.** Probing it needs a turn with the model; the shape here is the SDK's.

## The context window

- **The request.** `{"subtype":"get_context_usage"}`, optionally with `"detail":"summary"`, which the SDK describes as
  answering "from the last response's usage and local estimates". Documented and not marked experimental:
  `Query.getContextUsage(opts?: { detail?: 'summary' | 'full' })`. No message reaches the model. [TS] [PROBE]
- **The answer** (2.1.292, a new conversation, the Default model): [PROBE]
  - `totalTokens` 16954, `maxTokens` 1000000 (`rawMaxTokens` the same), `percentage` 2 (a whole number);
  - `autoCompactThreshold` 967000 and `isAutoCompactEnabled` true: Claude Code compacts the conversation at 96.7% of
    this window;
  - `categories`, each a `name`, `tokens` and `kind`: System prompt, System tools and Skills (`used`), System tools
    (deferred) (`deferred`), Autocompact buffer (`buffer`) and Free space (`free`); Messages appears once there are
    messages;
  - `model`, `memoryFiles`, `mcpTools`, `agents`, `slashCommands`, `skills`, `messageBreakdown`, `apiUsage`, and
    `gridRows`, a picture for a terminal.
- **The window depends on the model.** The same Claude Code reported a 1,000,000-token window for its Default model;
  the size, the percentage and the threshold all come from Claude Code, so Arden Code computes none of them. [PROBE]
- **The SDK also defines `SDKContextUsage`** on assistant messages, with `total_tokens`, `raw_max_tokens`,
  `percentage` and `over_limit`. Not seen in a probe. [TS]

## Usage limits, again

- **They are reported.** Signed in on a Pro plan, `get_usage` answered `five_hour` 12% and `seven_day` 15%, each with
  its reset time. The status bar would show them; on the maintainer's machine it is turned off
  (`appearance.showStatusBar: false`), which is the only reason they never appeared. [PROBE] [CODE]

## The Claude logo

- **Claude Code's Legal and compliance page:** a product may say accurately, in plain text, that it runs Claude Code,
  but may not use the Claude Code or Anthropic names or logos in its own product, feature or company name, in its own
  logo, or so as to suggest Anthropic built, endorses or partners with it. "Any other use of Anthropic's names or logos
  is governed by our Trademark Guidelines and requires our written permission." [LEGAL]
- **The Trademark Guidelines** (effective 2024-08-01): the marks may be used "only as specifically permitted by us and
  only in materials we approve beforehand", the logos may not be altered, and permission can be withdrawn. They say
  nothing about showing a logo to name an integration. [TM]
- **The Agent SDK's branding guidelines** allow "Claude" inside a menu of agents, and forbid visual elements that mimic
  Claude Code. [SDK]
- **So:** showing Claude's mark in the agent menu is "any other use", and needs a written yes from Anthropic. The mark
  is also orange, and Arden Code keeps vendor colors out (ADR 0003, plan section 7.3).

## Sources

- [HELP] `claude --help` of Claude Code 2.1.292.
- [PROBE] Claude Code 2.1.292, signed in, started from an empty folder with `-p --input-format stream-json
  --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio --permission-mode
  <mode> --no-session-persistence` and the environment cleaned of `CLAUDE*` and `ANTHROPIC*` variables; sent
  `initialize`, then `get_context_usage`, `set_permission_mode` and `get_usage`. No message, so no call to the model.
- [TS] `@anthropic-ai/claude-agent-sdk` as published on 2026-10-10: `sdk.d.ts` (`Query.setPermissionMode`,
  `PermissionMode`, `PermissionUpdate`, `Options.allowDangerouslySkipPermissions`, `Query.getContextUsage`,
  `SDKControlGetContextUsageResponse`, `SDKContextUsage`) and `sdk-tools.d.ts` (`ExitPlanModeInput`,
  `ExitPlanModeOutput`, `EnterPlanModeInput`).
- [LEGAL] [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), "Using the Claude Code name and
  logo", read on 2026-10-10.
- [TM] [Anthropic Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines), read on 2026-10-10.
- [SDK] [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), "Branding guidelines", read on
  2026-10-10.
- [CODE] Arden Code at `71d0958`, and the maintainer's own settings file.
