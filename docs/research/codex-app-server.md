# Codex app-server: release-matched research

- Date: 2026-11-11
- Target: the official Windows x64 `@openai/codex` 0.167.1 package.
- Scope: isolated, signed-out startup and protocol metadata. No model turn or user-project execution.

## Sources and package identity

- [App Server](https://developers.openai.com/codex/app-server.md), redirected to the current
  [OpenAI documentation](https://learn.chatgpt.com/docs/app-server.md).
- [Authentication](https://developers.openai.com/codex/auth.md).
- [OpenAI source README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).
- [Official npm package](https://www.npmjs.com/package/@openai/codex).

The npm registry's current version was 0.167.1 when queried. Its Windows x64 distribution was
`@openai/codex@0.167.1-win32-x64`. The downloaded archive was checked against npm's integrity value:

```text
sha512-yvUA7s46paDIT5I3Phz8KcoGpSGlWR3pOS0npqQ3LQMpjtTOBWoLPRdjuoKVreuKIuOLDMxwWCID4nwojbbrSA==
```

The package keeps its real program under
`vendor/x86_64-pc-windows-msvc/bin/codex.exe`, beside `codex-resources`, `codex-path` and
`codex-package.json`. This was observed in the archive, not inferred from Claude's npm layout.
The main npm wrapper and its optional-dependency layout still need a resolver test before Arden
follows an npm install to this executable. Never parse or execute a wrapper with untrusted arguments.

The isolated copy lives in Hermes scratch, not in Arden's dependencies or on the user's PATH.
It is not a user installation or an authenticated connection.

## Isolation and what actually ran

The probe used a fresh `CODEX_HOME`, an empty scratch project and an environment with the known
OpenAI/Codex key variables removed. It did not inspect the person's Codex home or credential files.
The client opted out of experimental API use and requested explicit gateway authorization rather
than an automatic browser login. Analytics were explicitly disabled. No `turn/start` was sent.

The real program returned `codex-cli 0.167.1`. Its own command help confirmed:

- `codex app-server --listen stdio://` (stdio is also the default).
- `codex app-server generate-json-schema --out <directory>`.
- `--experimental` adds experimental methods/fields to generated schemas.
- `codex login` and `codex login status`; status returned `Not logged in` for the isolated home.

Schema generation succeeded with 322 non-experimental JSON files and 470 with experimental output.
Those schemas describe this release, not whichever source revision happens to be on GitHub main.
The term non-experimental here describes the generator selection; it is not a blanket stability
promise for every included method. The public reference still warns against production plugin calls.

### Protocol observations

| Operation | Actual result | What it establishes |
|---|---|---|
| `initialize`, then `initialized` | Success; platform and user-agent fields returned | Local JSON-line handshake works for this client identity |
| `account/read`, `refreshToken: false` | Success; `account: null` | Signed-out status can be obtained without offering an Arden login |
| `model/list` | Success; catalog and effort options; no next cursor | Catalog discovery can work signed out; it is not proof of model entitlement |
| `skills/list` for the scratch project | Success; data returned | Skill metadata endpoint is callable in this isolated setup |
| `account/rateLimits/read` | Error `-32600`: account authentication required | Missing figures must not appear as zero or stop a reply |
| `thread/start`, explicit `read-only` sandbox and `untrusted` approvals | Success; returned thread id, `approvalPolicy: untrusted`, `sandbox.type: readOnly`, `networkAccess: false` | Policies can be requested and read back; this does not prove runtime enforcement |
| `thread/resume` on that empty thread | Error `-32600`: no rollout found | An id from thread creation is not itself a durable, resumable conversation |
| Closing stdin | Process exited with code 0 | Clean close worked in this probe |

The model catalog contained efforts beyond the app's current closed effort enum, including `ultra`.
Do not truncate Codex choices to Claude's existing list or silently remap an unknown effort.

## Implications for the design

1. Use the existing agent-driver/session-store seam and the supervised piped process. JSON-RPC ids,
   thread ids, turn ids and server-request ids must remain distinct and correctly correlated.
2. Keep transient thread creation separate from durable conversation checkpointing. Persist/resume
   must be tested after an accepted turn and after process restart. An empty or missing rollout
   needs a visible recovery decision, not an unnoticed new conversation.
3. Start the first basic session slice with an explicitly labeled Codex-native read-only policy,
   requested and echoed by the server. Do not call it Claude's Manual mode or claim all commands ask.
   Additional sandbox/approval choices need the approvals slice and real enforcement evidence.
4. Discover models and supported efforts from the CLI, with Default preserving the CLI's choice.
   Keep availability separate from authentication and model entitlement.
5. Read only the minimal account readiness fields; never retain an account email, token or raw
   account response in logs or diagnostics. The CLI remains responsible for authentication.
6. Use CLI-provided figures, hide unknown/unavailable values and do not copy Claude's usage-window
   names or compaction thresholds. Keep context-window derivation separately justified and tested.
7. Reject unsupported authority-bearing server requests safely. Do not hang while a request waits,
   or turn an unsupported choice into approval. Stop/cancellation must target the right turn.
8. Skill discovery is not skill installation. Plugin mutation stays gated by production API support;
   its presence in a generated schema does not lift the public warning.

## Test seams and planning gates

The highest existing seam is `SessionStore` driving an `AgentDriver`, as the Claude process tests
already demonstrate. A deterministic Codex stand-in exercises the real supervised process path;
UI integration tests cross mocked typed IPC. Internal framing tests supplement these seams, not
replace a complete session behavior. Review and delivery remain single-agent, test-first and
Windows/Linux, with ten repetitions for new/changed end-to-end and screenshot tests.

The `to-spec` and `to-tickets` skills were installed through Hermes's approved catalog flow from
`mattpocock/skills` and loaded before planning. The maintainer delegated product decisions to the
councils and approved continuing after their initial report. The council's next round records the
seam and ticket-granularity decisions; these do not constitute completed implementation.

Still unverified: a signed-in reply, emitted tool/file/approval/question events, actual sandbox
containment, durable resume after a real turn, Stop during generation, concurrent sessions, plugin
mutations and Linux execution. 0.167.1 is the probed candidate, not a claimed fully supported minimum.

## Connecting the user's Codex

Install the CLI yourself or explicitly authorize its installation, then run `codex login` and complete
the browser flow. `codex login status` verifies the CLI's authentication. A ChatGPT subscription sign-in
and API-key sign-in are separate choices owned by Codex. Do not paste credentials into Arden or chat.

Once the driver exists, Arden finds the user's CLI, starts `codex app-server` over stdio and sends
`initialize`/`initialized`, then the session's thread/turn requests. The user does not manually start a
server, expose a listening port, install an MCP server or add a Hermes connector for this integration.
Hermes's own model connection is separate and is not a credential source for Arden.
