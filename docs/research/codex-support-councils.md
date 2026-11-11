# Codex support and the supplied agent logos: the councils

- Date: 2026-11-11
- Input: the maintainer's request to add Codex, the four supplied logo files, the two initial interview
  questions, and the subsequent direction to let the councils answer and override the logo policy.
- Codebase: `c5f3decb12f8044eb005e62ee975be575c26451f`, on `feat/codex-support`.
- Method: the five councils and 25 roles of [the Claude councils](claude-agent-councils.md): product
  (P1–P5), experience (E1–E5), architecture (A1–A5), reliability (R1–R5), delivery (D1–D5). These are
  deliberative lenses applied by one agent, not independent agents or outside reviewers. This respects
  `CLAUDE.md`'s single-agent rule. Objections and their resolutions are recorded below.
- Authority: the maintainer delegated the answers. The explicit logo override is an input, not a
  question to ask again. Council decisions change the project's design, not a vendor's permissions.

## Evidence and its limits

This is the initial design/research snapshot. The later observed implementation and account state
are recorded in [round 4](#round-4-the-first-working-native-slices), not retroactively claimed here.

Read alongside ADRs 0003, 0017, 0028, 0039, 0041, 0044 and 0053, the glossary and plan sections 5.8,
6.12, 6.13 and 7. Current primary sources, retrieved on 2026-11-11:

- [OpenAI's App Server documentation](https://developers.openai.com/codex/app-server.md), which
  redirected to [the current documentation](https://learn.chatgpt.com/docs/app-server.md).
- [OpenAI's app-server source README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).

The documentation lists thread start/resume, turn streaming and interruption, model/effort discovery,
approvals, skills and usage-limit reporting. It also explicitly warns production clients not to call
`plugin/list`, `plugin/read`, `plugin/install` and `plugin/uninstall` yet. The source tree and public
reference evolve separately; neither is evidence of the protocol an installed release actually runs.

Observed locally: Codex detection exists, but `AgentKind` and the driver registry contain only Claude
and Demo. `codex`, `codex.exe` and `codex.cmd` are not on this tool session's PATH. No real Codex
handshake, signed-in reply or permission-mode probe was performed. No minimum Codex version is
claimed by this record. The logo originals were copied and checked byte-for-byte, not verified as
vendor-distributed downloads; their source URLs and permission grants were not supplied.

## Round 1: the interview's frontier

### Q1. A chat-only minimum, or a first-class Codex agent?

Options: **A** a first-class agent with the existing session experience and Codex-native capabilities;
**B** text-only sessions, with approvals, persistence and controls postponed; **C** literal Claude
feature parity, including Claude's names and permission semantics.

- **Product:** P2 chooses A: a coding agent must be usable for real project work, not only answers.
  P3 needs install/sign-in guidance and the Playground. P5 wants a bounded release, not every Codex
  feature exposed at once.
- **Experience:** E1 chooses A: keep the session view, message box, approval/question cards and keyboard
  behavior people already know. E5 rejects labeling a Codex control with a Claude-specific promise.
- **Architecture:** A1 keeps one agent and one project per session. A3/A5 reuse the driver/store seam,
  with capabilities supplied by each agent, not another set of Claude conditionals spread across UI.
- **Reliability:** R2/R3 reject B: resuming and safe approvals belong in the first usable integration.
  R1 rejects C: a familiar label does not prove equivalent behavior.
- **Delivery:** D1 dissents to making every optional API a release dependency. Settled: the core is a
  sequence of vertical slices; optional capabilities have explicit gates rather than silent omissions.

**Verdict: A.** Core scope: Codex sessions in the Playground and trusted folder projects; saved turns
and restart/resume; streamed text and exposed reasoning; tool calls and file changes; approvals and
supported questions; Stop; model/effort selection; native permission controls; install/version/sign-in
status; context-window and usage-limit figures when reported; skill discovery and supported invocation.
The Plugins page gains Codex when the production API gate in Q5 is met. Raw mode, attachments, importing
old CLI sessions, nested subagent views and handing context to linked sessions remain outside this build.

### Q2. Keep the old no-logo rule, or accept the maintainer's override?

Options: **A** keep generic agent icons; **B** replace the internal rule with a narrow exception for the
supplied vendor artwork; **C** remove all vendor-branding and licensing safeguards.

- **Product:** P1's explicit direction selects B; asking the same permission-policy question again
  would ignore that direction. P2 wants recognizable agents.
- **Experience:** E2/E5 use the Claude symbol for Claude and the supplied OpenAI artwork for Codex;
  the agent remains named Codex, regardless of `chatgpt-logo.svg`'s filename. E3 keeps visible names:
  artwork alone never supplies the only accessible name.
- **Architecture:** A1 preserves accepted ADRs as history. A3 changes the current plan and adds a
  superseding ADR rather than rewriting ADR 0044's unrelated permission/context decisions.
- **Reliability:** R3 objects that repository approval is not vendor permission. Settled: record that
  distinction and the unverified provenance explicitly; never invent a permission grant or MIT license.
- **Delivery:** D3's external-rights concern remains a release consideration, not the superseded
  blanket internal ban. D5 rejects C: the exception is for identifying supported agents, not rebranding
  Arden Code or suggesting affiliation.

**Verdict: B.** [ADR 0064](../adr/0064-vendor-logos-for-agent-identification.md) supersedes the logo
clauses of ADRs 0003 and 0044. The supplied files are eligible for app use; no additional internal
written-permission prerequisite is imposed. This does not assert external permission was granted.

## Round 2: decisions opened by that scope

### Q3. Must Codex use Claude's models, efforts and permission modes?

- **Product:** P2 wants the choices their Codex actually offers, not an invented cross-vendor list.
- **Experience:** E5 keeps consistent placement and plain descriptions, but not misleading identical
  labels. Claude-only Ultrathink must not appear for Codex.
- **Architecture:** A3/A5 make model, effort and control availability agent-specific. The CLI owns its
  defaults; unsupported settings are not carried across an agent change in an empty session.
- **Reliability:** R3 objects to treating Codex approval policy, sandbox policy and planning as one
  interchangeable Claude mode. Settled: establish exact mappings against a real release first;
  unsupported choices stay unavailable, and no mapping silently broadens authority.
- **Delivery:** D1 makes that mapping a research/probe prerequisite for the controls ticket, not a user
  questionnaire or a guessed constant.

**Verdict:** share the UI patterns, not unproven semantics. Retain the default-off Bypass permissions
setting and the rule that a new session never inherits bypass. A change only displays as applied once
the driver has confirmed it; lack of support is explicit.

### Q4. What safety and persistence promises carry over?

- **Product/Experience:** P1/E1 keep trust, cancellation, waiting notifications, archive/delete and
  error guidance consistent with Claude.
- **Architecture:** A2 keeps Codex's returned conversation id with the session; it is an opaque value,
  not a UUID Arden Code invents. Agent/project choices lock after the first message. Linked sessions
  start empty. A1 leaves the existing Claude-first default intact and uses available Codex before Demo
  when no session supplies a choice and Claude is unavailable.
- **Reliability:** R3 keeps credentials with the person's CLI, checks trust in Rust before project
  execution and uses the process supervisor. Protocol stdout is not logged. Unknown approval or
  permission requests fail closed. R2 objects to silently replacing a missing saved conversation:
  settled by a visible recovery choice rather than an unnoticed new conversation.
- **Delivery:** D4 requires actionable, coded errors, with no token, account-email or raw protocol dump.

**Verdict:** preserve those guarantees. Stop targets only the intended turn; it is not implemented by
killing a process that may serve unrelated work. Arden archive/delete does not delete the CLI's own
history. Process lifetime and routing must be exercised with concurrent sessions before shipping.

### Q5. Does Codex plugin management have to ship immediately with the driver?

- **Product:** P2 wants the existing unified Plugins page; P5 does not want unstable optional APIs to
  prevent everyday Codex sessions.
- **Experience:** E1 exposes a clear unsupported state rather than an enabled control that cannot work.
- **Architecture:** A5 keeps ADR 0053's second adapter direction; no copying skills or editing Codex
  configuration files directly as a workaround.
- **Reliability:** R1/R3 object to shipping calls the current public reference warns production clients
  not to use. Having method names in the source does not settle release support.
- **Delivery:** D1 accepts a feature gate. This changes the earlier expectation that Codex plugin
  management necessarily arrives in the driver's first release.

**Verdict:** plugin parity stays in scope, but stable production availability and a release-matched
probe gate enabling its controls. Core sessions do not wait on that gate. Skills have their own
capability checks; they are not automatically disabled merely because plugin installation is gated.

### Q6. What artwork changes and placements are allowed?

- **Experience:** E2 uses the supplied SVG masters for the agent menu and session identity, with PNGs
  kept as fallbacks/reference. Preserve geometry, proportions and supplied colors. Use a contrasting
  neutral surface where necessary, not CSS recoloring/inversion. Do not spread vendor colors into
  the rest of the interface. E3 retains the existing accessible control names; adjacent artwork is
  decorative. Demo keeps its flask.
- **Architecture:** A3 keeps source originals outside Arden's generated brand output. The renderer
  may wrap the unchanged SVG, but must not reconstruct or alter its paths.
- **Reliability:** R1 asks for byte-identity checks on originals, component tests for the rendered
  asset and existing accessible names, and light/dark visual evidence.
- **Delivery:** D3 keeps the affiliation disclaimer and excludes third-party artwork from the MIT
  grant. D1 separates the policy decision from the later tested UI wiring.

**Verdict:** a narrow identification-only exception. Neither Arden Code's app icon nor its own logo
changes. The artwork is not claimed to be an official Codex-specific logo merely because it is used
beside Codex.

### Q7. What proves implementation is ready?

- **Reliability:** R1 requires a pinned real-CLI version, generated schema and a no-model-call handshake
  probe before protocol fixtures are called verified. Scripted frames and a stand-in test driver/store,
  IPC and real process behavior deterministically. A signed-in smoke test is separate evidence, not
  replaced by mock success. R5 covers Stop, late events, crashes and concurrent sessions.
- **Delivery:** D2 keeps Windows/Linux CI and the separate Standards and Spec reviews. Changed end-to-end
  and screenshot tests run ten times. D1 works dependency-linked vertical tickets, not a horizontal
  protocol/UI/storage rewrite.
- **Architecture:** A3 keeps the generated Rust/TypeScript contract in sync. No speculative refactor of
  Claude is justified merely by adding a second real agent.

**Verdict:** research/probe, spec and blocking-edge tickets precede test-first implementation. The
router's missing `to-spec` and `to-tickets` skills must be recovered from a verified source before
claiming those named phases ran. No commit, push, issue publication or merge is authorized by this
record alone.

## Result and remaining evidence gates

The product questions above are settled by the delegated councils. [ADR 0065](../adr/0065-codex-as-a-first-class-agent.md)
records the integration boundary; ADR 0064 records the explicit logo override. The plan and current
vendor-policy notes follow them. Historical councils and accepted ADR bodies remain unchanged.

Still unobserved: release-matched Codex behavior, a minimum supported version, signed-in operation,
production-ready plugin management, logo rendering and the Codex driver itself. These are engineering
and release evidence gates, not further questions for the maintainer to answer on the agent's behalf.

## Round 3: the approved continuation into spec and tickets

The maintainer approved the council result and directed continuation with the proper Matt Pocock
workflow. The actual `to-spec` and `to-tickets` skills were then installed from `mattpocock/skills`
through the approved Hermes catalog flow and loaded. This round supplies their requested seam and
granularity review under the existing council delegation; it does not ask the maintainer to answer
the same design questions again.

[The release-matched research](codex-app-server.md) now records an isolated real Codex 0.167.1
handshake, model/effort and skill metadata, a signed-out rate-limit error and read-only thread
creation. It sent no model turn. Resuming that empty thread failed with no rollout found: a real
thread id is not proof of durable conversation history. These observations update the evidence
status after the original rounds; they do not retroactively prove a signed-in integration.

### Q8. Are the proposed testing seams the right ones?

- **Product/Experience:** P2/E1 want tests of a session a person can actually use, not only a parser.
- **Architecture:** A3 keeps the existing session-store/agent-driver seam as the primary surface.
  The real supervised process gets a deterministic Codex stand-in, following Claude's process tests;
  the UI crosses the existing typed IPC seam. Internal framing tests supplement, not replace, these.
- **Reliability:** R1 asks for an empty-thread/no-rollout regression and separate evidence for actual
  sandbox enforcement and a signed-in reply. R3 requires an isolated home for unauthenticated probes.
- **Delivery:** D1 objects to starting a new lower-level testing framework. Settled by reusing the
  existing seams and adding no speculative cross-agent refactor.

**Verdict:** approve these seams for the spec. The initial basic Codex session uses an explicitly
described native read-only policy, not a guessed mapping to Claude Manual. Additional authority
choices wait for approval handling and verification. Reported efforts such as `ultra` must not be
lost to Claude's existing closed list.

### Q9. Is the proposed ticket granularity and dependency graph right?

| Ticket | Blocked by | Independently verifiable result |
|---|---|---|
| T1 Supplied Claude artwork | None | Existing agent controls/header render the original artwork accessibly |
| T2 Codex readiness | None | Settings reports safe native launch/version/sign-in readiness and guidance |
| T3 Safe Codex sessions | T2 | Select, send, stream, stop, save and resume with explicit native read-only behavior |
| T4 Tools, files and requests | T3 | Inspect work and safely answer/cancel approvals, permissions and supported questions |
| T5 Native choices and permissions | T4 | Choose reported models/efforts and verified authority settings with bypass guarded |
| T6 Context window and usage limits | T3 | Correct agent/session figures, with unknown values handled honestly |
| T7 Skills and file mentions | T3 | Supported native invocation/input through the existing message box |
| T8 Plugin support gate | T3 | Shared page distinguishes unsupported Codex operations without blocking sessions |
| T9 Integrated delivery verification | T1, T4, T5, T6, T7, T8 | Lifecycle/concurrency/platform and separately reported real-CLI evidence |

- **Product:** P5 accepts nine narrow deliverables, with an immediately visible artwork slice and
  readiness work independent of it. P2 objects to mistaking the early read-only session for a finished
  coding integration. Settled: T3 is a tracer bullet, not completion of the parent; T4/T5 remain required.
- **Experience:** E1 keeps every ticket observable in the app rather than splitting protocol, storage
  and UI into separate horizontal tickets. T1 does not expose a nonfunctional Codex choice.
- **Architecture:** A3 requires T3 to include its domain/storage/IPC/UI path; no preparatory abstraction
  ticket is justified by the current code. T5 depends on real approval handling, not only on catalogs.
- **Reliability:** R1/R5 keep independent metadata/invocation slices behind a real session, and require
  exact native blocking links. T9 collects integration evidence; it does not defer the safety needed
  to accept each earlier ticket.
- **Delivery:** D1 challenges making production plugin availability a blocker. Settled: T8 can deliver
  and test the explicit closed-gate state; T9 waits for that honest UX, not for unstable mutations.

**Verdict:** approve the breakdown, granularity and edges. No merge/split is needed. Publish the
spec and self-contained tickets as ready-for-agent, with native sub-issue/blocking relationships.
Keep the parent open and do not close a child before its acceptance and required CI evidence exist.

## Round 4: the first working native slices

Observed November 11, 2026, after the maintainer reported that an installed Codex was absent from
the dropdown. The implementation and runtime evidence are in the
[#195–#196 report](../reviews/0195-0196-codex-sessions.md). These remain the same one-agent
deliberative lenses, not independent reviewers or votes.

### Q8. What makes the initial selectable Codex honest and usable?

| Council | Five role assessments | Resolution |
|---|---|---|
| Product | P1 keeps the person's CLI/account private; P2 requires actual project reading, not an inert menu row; P3 avoids an unnecessary reinstall/login when already signed in; P4 compares the local-CLI connection rather than introducing a hosted account; P5 keeps the parent distinct from its initial slices. | Ship only a working, readiness-gated read-only slice locally; the broader parent remains open. |
| Experience | E1 keeps existing selection, streaming and resume patterns; E2 preserves the supplied art with a neutral backing; E3 requires visible names, keyboard movement and restored focus; E4 keeps native executable/job ownership; E5 rejects calling the native policy Claude's Manual mode. | Codex is named explicitly, gets the original artwork and a native read-only badge, and does not expose Claude-only controls. |
| Architecture | A1 replaces a Claude-installed fallback boolean with an agent-kind fallback; A2 confirms opaque rollout checkpoints before saving them; A3 carries the new kind through Rust, IPC and UI; A4 binds UI events and cancellation to the session/turn; A5 keeps capabilities agent-specific. | Preserve explicit/inherited agents, otherwise Claude, ready Codex, then Demo; no silent conversation replacement. |
| Reliability | R1 requires deterministic process tests and repeated visuals; R2 keeps earlier transcripts on failed recovery; R3 refuses unknown authority and retains no account payload; R4 notes the startup cost of fresh servers; R5 rejects killing only a parent while descendants hold its pipes. | Use a scoped process tree and bounded private stdio; keep performance and cross-platform release claims within their evidence. |
| Delivery | D1 follows #195 before #196; D2 distinguishes local checks from Windows/Linux PR CI; D3 changes no external logo rights; D4 requires actionable readiness/failure codes; D5 keeps ownership in the existing supervisor instead of detaching leaking readers. | Record local evidence, do not close or merge tickets on a patch alone, and retain #197–#202 gates. |

**Dissent and evidence:** R3 rejects auto-approving the native file-read request merely to make the
smoke pass. The first `untrusted` run failed closed. A controlled same-account probe found a
command-approval request with `untrusted`, but an actual proof-file read with native `never`
pacing and the same confirmed `readOnly`/network-disabled sandbox. This is no-escalation pacing,
not a grant or a bypass flag. Unknown interactive requests remain refused. The native sandbox is
not a claim that every external tool server in the person's CLI configuration is itself confined.

R5 rejects detaching blocked reader threads: the inherited-pipe test failed before a per-connection
job was closed first and passed after it. A3 accepts a small extension of the existing supervisor,
not another process framework. R4's persistent-process alternative is deferred until it can retain
the same lifecycle invariants and has performance evidence.

**Verdict:** accept [ADR 0066](../adr/0066-scoped-noninteractive-codex-processes.md) and the initial
readiness/read-only implementation. Actual native file reading, saved-store restart/resume, four
theme/viewport cases and repeated deterministic checks are observed. This does not finish the
approval/question/control/figures/skills/plugin work or the full cross-platform release matrix.
