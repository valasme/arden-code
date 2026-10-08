# Claude Code's slash commands, models and effort: research

- Date: 2026-10-08
- Question: what does Claude Code tell Arden Code about its slash commands and its models, how do they behave on
  the pipes the driver speaks (ADR 0038), and how does `ultrathink` work?
- Read at: Claude Code 2.1.292 on the maintainer's machine, probed with the driver's own flags; the recorded 2.1.286
  frames in the driver's fixture; the TypeScript Agent SDK's published types (`@anthropic-ai/claude-agent-sdk`
  0.3.294); and the Claude Code docs on the date above.

## The answer in short

- **Claude Code already tells Arden Code its slash commands and its models.** The answer to `initialize`, which the
  driver sends and waits for today, carries `commands` and `models`. A `system/commands_changed` frame then replaces
  the command list as plugins, synced skills and MCP prompts load. Neither needs a message or an API call. [TS] [PROBE]
- **Typing a slash command already runs it.** The message reaches Claude Code as typed. A local command, such as
  `/context`, answers with a synthetic assistant message and no model turn. What is missing is the menu, and the
  handling of the commands that change what Arden Code also holds: the model, the effort, the conversation and the
  name. [PROBE] [SLASH]
- **The model list includes older, exact versions,** each with the effort levels it takes: on this machine, Opus 4.6
  to 4.8, Sonnet 4.6, Sonnet 5, Opus 5 and Fable 5, beside the latest of each family. [PROBE]
- **`ultrathink` is a word in the message, not an effort level.** Claude Code adds an instruction to reason more
  deeply for that turn only, and leaves the effort as it is. It already works in Arden Code when typed. [MODEL]

## Slash commands

### Where the list comes from

- **The answer to `initialize`** holds `commands`, a list of `SlashCommand`: `name`, `description`, `argumentHint`,
  optional `aliases`, and `builtin`, which is true for Claude Code's own commands and absent for a user's, a project's,
  a plugin's or an MCP server's. [TS]
- **`system/commands_changed`** pushes the whole list again after a change. "Clients should REPLACE their cached
  command list with this payload." [TS]
  - In the probe, the answer to `initialize` held 81 commands, a push 2 seconds later held 105, and pushes after the
    first message held 281, once the plugins synced from claude.ai and the MCP prompts had loaded. [PROBE]
  - With no message sent, the list stayed at 105 for the 8 seconds the probe waited. [PROBE]
- **`system/init`**, sent at the start of each turn, repeats the names in `slash_commands` and marks a subset in
  `terminal_slash_commands`: commands "whose UX is bound to the local terminal". Remote UIs should hide them; "desktop
  surfaces may keep them". In 2.1.292 they are `doctor`, `color`, `focus` and `reload-plugins`. [TS] [PROBE]
- **Commands that need an interactive terminal,** such as `/theme`, are not listed at all. [SLASH]

### What the rows look like

- **Built-in:** `builtin: true`, some with aliases (`/clear` also answers to `/reset` and `/new`) and an argument
  hint (`/effort` takes `<low|medium|high|xhigh|max|auto>`). [PROBE]
- **A plugin's skill or command:** `plugin:name`, with the short name as an alias when nothing else has it (for
  example `mattpocock-skills:tdd`, alias `tdd`). Its description starts with the plugin's name in brackets. [PROBE]
- **A skill synced from claude.ai:** its short name, with `anthropic-skills:name` as an alias. [PROBE]
- **An MCP server's prompt:** `server:prompt (MCP)`. [PROBE]
- **Internal names** appear too, such as `__remote-workflow` and `workflow-launch-exec` ("server-launched sessions
  only"). [PROBE]
- **Claude Code's own menu** matches the typed letters against a name or an alias, from its start or from a word
  within it, ignoring `:`, `_` and `-`. It keeps a few commands, such as `/heapdump`, out of the menu until their full
  name is typed. [CMDS]

### Running one

- **A slash command is a message that starts with `/name`.** The text after the name is its arguments. [CMDS] [SLASH]
- **A local command answers without a model turn:** an `assistant` frame whose model is `<synthetic>`, with
  `local_command_run` naming the command, then a `result` with `local_command` and a cost of 0. [PROBE]
  - `/context` returns a Markdown report of the context window. `/model` with no argument prints the current model
    and how to name another. `/effort` with no argument prints its usage. [PROBE]
  - The SDK also defines a `system/local_command_output` frame for some local commands. [TS]
- **Arden Code shows that text today, by reading the code:** the reply turns an assistant frame's text block into a
  text item (`claude/reply.rs`). Not tried in the app.
- **An unknown `/name`** goes to Claude as an ordinary message with a note that no command ran: a model turn (since
  2.1.274). A built-in that is not available here answers `/x isn't available in this environment.` with no model
  turn. [SLASH]
- **`/compact`** sends `system/compact_boundary`, with `compact_metadata.pre_tokens` and `trigger`. [SLASH]

### Commands that change what Arden Code also holds

- **`/model <model>`** works under `-p` and applies to that Claude Code only. [CMDS] Arden Code's menu still shows its
  own choice, and the next start of the session's Claude Code (after a choice changes, or 10 idle minutes) passes
  Arden Code's choice again.
- **`/effort <level>`** works under `-p`, with the same result. [CMDS]
- **`/clear`** (also `/reset` and `/new`) starts a new conversation. Claude Code sends `conversation_reset` with a
  `new_conversation_id` and `trigger: "clear"`; "a consumer should reset on every conversation_reset frame". [TS]
  [CMDS] Arden Code ignores the frame today, so its next `--resume` would bring the cleared conversation back.
- **`/rename`** names Claude Code's own copy of the conversation. [CMDS] The session in Arden Code keeps its name.
- **`/config key=value`** writes Claude Code's settings files, including under `-p`. [CMDS]

## Models

- **The answer to `initialize`** holds `models`, a list of `ModelInfo`: `value` (what `--model` takes),
  `resolvedModel`, `displayName`, `description`, `supportsEffort`, `supportedEffortLevels`, and whether the model
  supports adaptive thinking, fast mode and auto mode. [TS]
- **On this machine** (2.1.292, signed in), the rows were, in order: Default (recommended), which is Sonnet 5.5 for this
  account; Opus 5.5; Sonnet 5.5; Fable 5.1; Haiku 4.5; Sonnet 5; Opus 5; Fable 5; Opus 4.8; Opus 4.7; Opus 4.6;
  Sonnet 4.6. The first five rows have aliases as their values (`opus`, `sonnet`, `fable`, `haiku`); the older rows
  have full ids (`claude-opus-4-8`). [PROBE]
- **The list depends on the version and the account:** the signed-out 2.1.286 recording listed five rows. [FIX]
  Administrators can narrow it with `availableModels` and `deniedModels`. [MODEL]
- **Aliases float; full names pin.** An alias means the latest model of its family for the provider; a full name such
  as `claude-opus-5-5` stays on that version. [MODEL] `/model` takes "sonnet, opus, haiku, fable, best, sonnet[1m],
  opus[1m], fable[1m], opusplan, default, or a full model ID". [PROBE]
- **New models need a new Claude Code.** Opus 5.5 needs 2.1.280, Sonnet 5.5 needs 2.1.284, and Haiku 5.5 needs
  2.1.293. [MODEL] On 2.1.292, `haiku` is Haiku 4.5. [PROBE]

## Effort

- **Levels by model:** Fable 5.1 and 5, Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 5, Sonnet 5, Opus 4.8 and Opus 4.7 take
  `low`, `medium`, `high`, `xhigh` and `max`. Opus 4.6 and Sonnet 4.6 take all but `xhigh`. Other models, such as
  Haiku 4.5, take none. [MODEL] [PROBE]
- **An unsupported level runs as the highest supported level at or below it,** so `xhigh` runs as `high` on Opus 4.6.
  [MODEL]
- **A model's own default** is `medium` on Opus 5.5, Sonnet 5.5 and Haiku 5.5, `xhigh` on Opus 4.7, and `high` on
  most others. [MODEL]
- **Arden Code today** offers every level for every model, Haiku included.

## Ultrathink and ultracode

- **Ultrathink:** "Include `ultrathink` anywhere in your prompt to request deeper reasoning on that turn without
  changing your session effort setting." Phrases such as "think hard" are no longer keywords. [MODEL]
- **It works on the driver's protocol.** The desktop app runs Claude Code through the same protocol; when the
  maintainer's message held the word, Claude Code added its instruction to that turn (observed 2026-10-08). Arden Code
  sends the message text as typed, so the word reaches Claude Code.
- **Ultracode is something else:** a setting with which Claude plans a dynamic workflow for each substantive task, at
  any effort level. `--effort ultracode` starts at `xhigh` with it on. The word `ultracode` in a message opts that
  turn into the Workflow tool, unless `workflowKeywordTriggerEnabled` is false. It needs workflows turned on and a model
  that takes `xhigh`. [MODEL] [TS]

## Other findings

- **Changing the model or effort without a restart:** the `apply_flag_settings` control request takes `model`,
  `effortLevel` (including the session-only `max`) and `ultracode` in streaming input mode. [TS] ADR 0041 restarts
  the session's Claude Code with `--resume` instead; this request could remove that restart later.
- **A spare Claude Code:** the SDK's `prewarm()` starts a Claude Code before any session exists and binds it to a
  session at its first message. [TS]
- **The message box's icons** (`ChoiceButton`) are Lucide's bot, folder, cpu and gauge, at 14 px with a 1.5 stroke, in
  `muted-foreground` beside labels in `foreground`, so they read dimmer than their labels. Plan section 7.5 sets 16 px
  for icons in the UI.
- **The screenshot baseline** of the design system page still shows only the agent and project menus. The model and
  effort menus landed within the screenshot test's 1% tolerance, so a change of icons would pass unseen as well.

## Sources

- [PROBE] Claude Code 2.1.292, installed with winget, started in an empty folder with the driver's flags and an
  environment without the variables of the session it was started from, 2026-10-08. One run sent only `initialize`;
  three runs sent `/context`, `/model` and `/effort` (local commands, cost 0). One more run sent a message that Git
  Bash had turned into a path, which reached the model; only its `system/init` frame is used here.
- [FIX] `crates/arden-agents/src/claude/fixtures/signed-out-2.1.286.ndjson`: the real Claude Code 2.1.286, signed out.
- [TS] `@anthropic-ai/claude-agent-sdk` 0.3.294, `sdk.d.ts`:
  <https://cdn.jsdelivr.net/npm/@anthropic-ai/claude-agent-sdk@0.3.294/sdk.d.ts> (`SlashCommand`, `ModelInfo`,
  `SDKSystemMessage`, `SDKCommandsChangedMessage`, `SDKConversationResetMessage`, `SDKLocalCommandOutputMessage`,
  `SDKControlInitializeResponse`, `applyFlagSettings`, `prewarm`).
- [SLASH] Extend agents with skills, section "Commands in Agent SDK sessions":
  <https://code.claude.com/docs/en/agent-sdk/slash-commands>.
- [CMDS] Commands: <https://code.claude.com/docs/en/commands>.
- [MODEL] Model configuration: <https://code.claude.com/docs/en/model-config>.
