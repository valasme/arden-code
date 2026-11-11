# Codex support: published ticket graph

Canonical spec: [#193](https://github.com/valasme/arden-code/issues/193).
The [local spec copy](codex-support.md) carries the same body, apart from transport line endings.
The councils approved the testing seams, granularity and edges in
[round 3](../research/codex-support-councils.md#round-3-the-approved-continuation-into-spec-and-tickets).

Every child is labeled `ready-for-agent`. Publication was read back: nine sub-issues and twelve
native blocking edges. The parent remains open; local work is not a closed/merged issue.

| Ticket | Delivers | Blocked by |
|---|---|---|
| [#194](https://github.com/valasme/arden-code/issues/194) | Supplied Claude artwork in agent controls | None |
| [#195](https://github.com/valasme/arden-code/issues/195) | Safely launchable Codex installation/version/sign-in readiness | None |
| [#196](https://github.com/valasme/arden-code/issues/196) | Select, send, stream, stop, save and resume a native read-only Codex session | #195 |
| [#197](https://github.com/valasme/arden-code/issues/197) | Tools, file changes, approvals, permissions and supported questions | #196 |
| [#198](https://github.com/valasme/arden-code/issues/198) | Reported models/efforts and verified native permission choices | #197 |
| [#199](https://github.com/valasme/arden-code/issues/199) | Agent/session-correct context-window and usage-limit figures | #196 |
| [#200](https://github.com/valasme/arden-code/issues/200) | Supported native skill invocation and project file input | #196 |
| [#201](https://github.com/valasme/arden-code/issues/201) | Honest plugin capability gate on the shared page | #196 |
| [#202](https://github.com/valasme/arden-code/issues/202) | Lifecycle/concurrency/platform and separate real signed-in verification | #194, #197, #198, #199, #200, #201 |

Work blockers first, one vertical ticket per implementation context. A closed plugin capability gate
can satisfy #201 with a tested unsupported state; #202 does not wait for experimental mutations to
become production-ready. No child or parent is closed solely because a patch or plan exists.

## Local implementation status

The #194 artwork and initial #195–#196 readiness/read-only driver slices are implemented locally.
The [native verification report](../reviews/0195-0196-codex-sessions.md) separates real signed-in
evidence from deterministic protocol fixtures. #197–#202 and the parent release gates remain open;
this is not a claim of completed delivery, commits, PR CI or a merged feature.
