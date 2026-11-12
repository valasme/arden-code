## Problem Statement

Arden Code detects Codex but cannot run a Codex session. A person who uses both agents must leave the app to work with Codex, loses the shared session controls, and cannot tell whether an installed Codex is ready. The existing controls also encode Claude-specific assumptions about models, efforts, permissions and usage limits. The maintainer supplied agent artwork and explicitly replaced the internal no-vendor-logo rule.

## Solution

Add Codex as a first-class agent through the person's own Codex CLI and its supervised local app-server. Reuse Arden's session experience while exposing only Codex capabilities with verified semantics. Keep credentials with Codex and preserve trust, cancellation, saved sessions and privacy. Use the supplied Claude artwork in the existing agent controls and the supplied OpenAI artwork when Codex becomes selectable. Deliver the feature in independently verifiable vertical slices; optional plugin APIs do not block core sessions.

## User Stories

1. As a developer, I want Settings to detect my Codex CLI, so that I know whether it is installed.
2. As a developer, I want its version and supported-version guidance, so that I can fix an incompatible installation.
3. As a developer, I want a clear signed-in/signed-out/unknown readiness state, so that unavailable account information is not mistaken for readiness.
4. As a developer, I want instructions to sign in through Codex itself, so that Arden never asks for my credentials.
5. As a Windows user, I want a normal npm installation to work without unsafe shell-wrapper execution, so that my messages cannot become shell commands.
6. As a Linux user, I want the same agent session behavior through my native CLI, so that Codex is not a Windows-only feature.
7. As a developer, I want to select Codex in the welcome state or an empty session, so that I can choose the agent before sending.
8. As a developer, I want agent and project choices to lock after the first message, so that a saved session retains its identity.
9. As a developer, I want new sessions to respect existing session inheritance and choose available Codex before Demo when Claude is unavailable, so that the fallback remains useful.
10. As a newcomer, I want Codex to work in the Playground, so that I can try it without opening a personal project.
11. As a developer, I want project trust to be checked before Codex runs project setup, so that opening a folder does not silently authorize its hooks or servers.
12. As a developer, I want streamed replies and exposed reasoning in the existing transcript views, so that I can follow Codex's work without waiting for completion.
13. As a developer, I want tool calls and file changes to reflect Codex's own events, so that I can inspect what it actually did.
14. As a developer, I want approval cards to show the requested command, file or permission, so that I can make an informed decision.
15. As a developer, I want approval choices to match what Codex supports and offers, so that a one-time approval is not expanded into persistent authority.
16. As a developer, I want Deny, Stop, archive and delete to settle waiting requests safely, so that the agent does not hang or continue with unintended authority.
17. As a developer, I want supported questions and elicitations presented accessibly, so that Codex can ask me for input without losing the reply.
18. As a developer, I want unsupported authority-bearing requests rejected visibly and safely, so that a new protocol variant cannot silently grant access.
19. As a developer, I want Stop to affect only the intended turn, so that other sessions keep working.
20. As a developer, I want my turns and Codex conversation checkpoint saved, so that a restart can continue a real conversation.
21. As a developer, I want an empty or missing CLI rollout distinguished from a resumable conversation, so that Arden does not silently lose history.
22. As a developer, I want archive/delete and project removal to end the relevant running work without deleting Codex's own saved history, so that local session management is predictable.
23. As a developer, I want clear errors for missing, signed-out, incompatible or crashed Codex, so that I know what to do next.
24. As a developer, I want the models and efforts my Codex reports, including values outside Claude's list, so that the controls do not misrepresent its capabilities.
25. As a developer, I want Default to leave a choice to Codex and unsupported saved choices identified, so that the app does not silently substitute a different model or effort.
26. As a developer, I want Codex-native sandbox/approval controls with accurate descriptions and confirmed state, so that familiar UI does not imply Claude permission semantics.
27. As a developer, I want bypass explicitly gated, off by default and never inherited, so that a new session cannot unexpectedly run unrestricted.
28. As a developer, I want reported context-window and usage-limit figures for the selected agent only, so that I can judge when to compact or wait without seeing invented zeroes.
29. As a developer, I want unknown figures omitted and reported reset/window information preserved, so that unavailable account data does not break sessions.
30. As a developer, I want Codex's discoverable skills and supported invocation syntax available in the message box, so that Claude-specific slash and mention rules are not sent accidentally.
31. As a developer, I want file mentions to carry the intended project file with verified Codex semantics, so that files are not confused with plugins or skills.
32. As a developer, I want the unified Plugins page to state whether Codex management is supported, so that unavailable mutations are not offered as working controls.
33. As a developer, I want plugin management to use only supported vendor-owned operations when its production gate opens, so that Arden does not become another writer of vendor configuration.
34. As a developer, I want recognizable supplied agent logos beside visible names, so that I can distinguish agents at a glance without relying on color or imagery alone.
35. As a developer using either theme, I want the supplied artwork readable without alteration, so that agent identity remains clear and its source artwork intact.
36. As a keyboard or screen-reader user, I want the existing focus, announcements, notifications and shortcuts to work with Codex, so that the new agent does not create a separate interaction model.
37. As a privacy-conscious developer, I want credentials, account email and raw protocol contents excluded from logs and diagnostics, so that working with Codex does not expose private data.
38. As a maintainer, I want deterministic protocol/process/UI tests and separate real-CLI evidence, so that stand-in success is never mistaken for a verified signed-in integration.

## Implementation Decisions

- The accepted council decisions and ADRs 0064/0065 are the design baseline. The local, signed-out 0.167.1 probe establishes startup and metadata behavior only, not a fully supported minimum or model entitlement.
- The Rust agent-driver and session-store seam owns session behavior. Extend the existing registry, typed IPC, storage and UI state together as each vertical slice requires; do not build a parallel Codex application inside Arden.
- Launch the person's own executable through the existing process supervisor, using JSON-RPC over local stdio. No bundled JavaScript runtime, token forwarding, embedded sign-in, third-party SDK or MCP transport is introduced. Keep CLI sign-in independent of Hermes's model connection.
- Validate the native executable and release compatibility. Resolve normal Windows npm layouts to their actual executable rather than parsing a wrapper or passing untrusted text through one. Preserve Linux's native executable path.
- Initialize with Arden's own client identity and negotiate capabilities explicitly. Do not impersonate a first-party client, opt into unsupported features by default or enable analytics through a first-party flag.
- Distinguish request ids, server-request ids, thread ids and turn ids. Correlate events and cancellation; bound queues/frame sizes and timeouts. A failed process or stale event must not complete the wrong turn or change another session's permissions.
- The initial basic session supports an explicitly described native read-only policy requested and echoed by Codex. It is not labeled Claude Manual. Additional authority choices arrive with verified approval handling; unsupported policies never fall back to a broader choice.
- Persist a CLI conversation checkpoint only when it is established as resumable. The observed empty-thread resume failure is a regression case. A missing conversation requires a visible recovery decision, not an unnoticed new session.
- Preserve existing agent/project immutability, project trust and session inheritance. Add available Codex before Demo only where the existing rule otherwise finds no agent and Claude is unavailable. Linked sessions remain empty and do not transfer prior conversation context.
- Use Codex-reported model/effort choices with an extensible, validated representation. Preserve Default, distinguish catalog visibility from access, and never truncate an unknown effort to Claude's closed enum.
- Store Codex-native permission state distinctly enough to avoid loss of meaning. Read back applied policy before presenting it as confirmed. Keep the existing default-off bypass guard and never inherit bypass; changes during a turn apply only where the protocol safely supports them.
- Map text, exposed reasoning, tools, file changes, approvals, supported questions, completion, interruption and errors into existing transcript behavior. Unknown security-relevant requests fail closed with a coded error; known notifications with new unrelated fields remain tolerable.
- Keep minimal account readiness and per-agent figures only. Never persist or log token-bearing responses, credential files, account emails, raw protocol streams or arbitrary vendor configuration. Missing figures are not zero; Codex windows and compaction semantics are not assumed to match Claude.
- Use the agent's reported skill/invocation and file-input capabilities. Do not blindly reuse Claude's slash syntax, Ultrathink or mention expansion. Standalone skill installation and copying vendor skill folders are not added.
- Codex plugin controls have an explicit unsupported state until both the vendor's production API guidance and a release-matched probe allow their operations. Presence in a schema is not sufficient. This gate does not block core sessions or independently supported skill discovery.
- Preserve the supplied logo source files byte-for-byte, outside Arden's brand generator. Use the Claude symbol for existing Claude controls; use the supplied OpenAI artwork for Codex when the agent exists. Keep visible names and decorative image semantics, source proportions/colors and appropriate neutral contrast. Do not alter Arden's own logo or app icon, imply affiliation or extend the MIT grant to vendor artwork.

## Testing Decisions

- Test external behavior at the highest existing seam: the session store exercising an agent driver. The maintainer delegated the seam and granularity decisions to the councils; the planning round retains this seam rather than inventing a lower-level primary test surface.
- Follow the existing Claude process-test pattern with a deterministic Codex stand-in and the real supervisor, pipes, working directory and cleanup. Add internal framing/correlation tests only where the high-seam test cannot precisely diagnose a protocol edge.
- Exercise create/send/stream/complete/save/reopen/resume, missing or empty rollouts, trust, approvals, question cancellation, Stop, late events, crashes, concurrent sessions and archive/delete cleanup. Assert that one session's control cannot affect another.
- UI integration tests cross mocked typed IPC through the app's existing interaction patterns. Assert accessible labels, keyboard behavior, agent-specific catalogs/permissions/figures and clear readiness/unsupported states, not component internals.
- Add source-artwork identity and rendered-logo checks; cover light/dark readability and the existing menu/header positions without rebuilding the artwork from copied path data.
- Preserve generated contract, settings/storage migration, lint, typecheck, build and brand checks. New/changed end-to-end and screenshot tests run ten times before merge. Windows and Linux CI must pass on the latest PR commit and an up-to-date branch.
- Keep stand-in tests, isolated real-CLI metadata probes and a real signed-in smoke test separately reported. No real model use, account connection or successful sandbox enforcement is claimed without the corresponding execution evidence.
- Run Standards and Spec reviews separately and sequentially, using the repo's single-agent rule. Review the changed security-sensitive behavior with the security plugin without confusing static analysis with runtime verification.

## Out of Scope

Raw terminal mode; attachments outside the existing message-input contract; importing old CLI or cloud conversations; nested subagent transcript views; transferring conversation context into linked sessions; Arden-managed authentication; reading or editing credential files; direct vendor configuration/skill-folder writes; automatic agent installation/update by Arden; unsupported plugin mutations; vendor-colored application themes.

## Further Notes

This is a multi-session build. The canonical spec and tracer-bullet tickets live in GitHub Issues with the ready-for-agent label and native blocking relationships. The councils approve the seam, ticket granularity and real blocking edges under the maintainer's delegation. Publishing the plan is not implementation completion. A ticket remains open until its acceptance criteria and required checks are verified; no issue is closed merely because code was written.

The research copy of Codex is isolated in scratch and is not installed on the person's PATH or signed in. User setup is a separate human-authentication step: install Codex, run its own login flow, verify status, then let Arden launch the local app-server once its driver exists.
