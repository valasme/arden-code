# Codex initial-slice PR preflight

- Baseline: `c5f3decb12f8044eb005e62ee975be575c26451f` (`origin/main`, freshly fetched).
- Branch: `feat/codex-support`.
- Scope: #194 artwork, #195 readiness and the initial #196 read-only session integration.
- Parent #193 and #197–#202 remain incomplete. This is preparation for PR CI, not merge approval.

## Workflow

The existing councils, ADRs 0064–0066, [spec](../specs/codex-support.md) and
[ticket graph](../specs/codex-support-tickets.md) remain the sources of truth. The implementation
was developed with failing-then-passing behavior tests; the runtime evidence is retained in the
[artwork review](0194-agent-artwork.md) and [native session review](0195-0196-codex-sessions.md).
The requested PR continues that workflow rather than starting another design or claiming full
Codex parity. Commits are grouped by artwork, native readiness/foundation and session integration.

## Standards

Separate same-agent assessment, performed before the Spec assessment, under the repository's
single-agent rule. Existing reports describe the source review and fixes. PR preparation rechecked
repository conventions, the complete changed-path inventory, native executable resolution, agent
menu/readiness boundaries, generated bindings, license/provenance policy and CI configuration.
No new production-code edits were needed. Conventional Commits and the installed hooks are kept;
no verification bypass, permanent test skip or CI weakening is introduced.

No unresolved documented-standard violation was identified in the examined implementation.
This is not an independent approval.

## Spec

Subsequent same-agent assessment against the freshly retrieved #194, #195 and #196 issue bodies
and comments, the local spec and the existing acceptance evidence. The initial slice covers vendor
artwork, launch/account readiness, real selection, native read-only send/stream/Stop/save/resume,
trusted-folder enforcement and fail-closed unsupported authority requests. Hidden Claude input
state and unsupported mention completion were corrected at both message entry points.

Windows/Linux PR checks remain required; local Windows evidence does not complete #195's platform
gate or #202. Editing, interactive approvals, richer tool presentation, models/efforts, figures,
file inputs, skills and plugins remain follow-ups. No issue is closed by this preflight.

## Verification before publication

- Fresh `CI=true pnpm check`: passed, including 933 desktop tests, 46 brand tests, the Rust workspace,
  formatting, lint, type checks, translations, dependency-direction checks and bindings contract.
- Fresh `pnpm brand:check` and `pnpm licenses:check`: passed.
- Fresh full visual suite: 12 passed. Earlier changed visual/native Settings cases were repeated
  ten times; their receipts remain in the linked reviews.
- Authorized native E2E already completed: 122 passed, no failures/flakes, retries disabled. Six
  existing debug skips and three maintainer-requested, run-only foreground-input exclusions are
  separately recorded in the [parsed result](0195-0196-codex-evidence/native-e2e-summary.json).
  CI keeps the unfiltered native suite; no exclusions are committed.
- Native signed-in file-read/restart-resume evidence is separate from deterministic stand-ins.
  The nine screenshot hashes match their recorded frozen native executable.
- Local `pnpm typos` and `pnpm deny` were attempted but their executables are not installed. They
  are not reported as passing; the PR's existing Audit job must run spelling and dependency checks.
- Release, installer, performance and Linux runtime checks were not established by this local
  Windows debug run. The PR's existing Windows/Linux workflows provide additional remote gates.
- Focused static security scan `scan_a5077efc8af303ea6d4f3832`: sealed, nine scoped files reviewed,
  no reportable findings, canonical artifact hashes verified. No target execution or mutation was
  performed during that review. No in-scope dependency manifest was scanned; this is not a
  whole-branch/dependency audit. The sealed artifacts remain in the local security-plugin store.

## Delivery boundary

Open the PR against `main` for CI and testing. Do not merge, enable auto-merge or close the parent
spec. Report the observed PR/check state after creation; a published branch is not a passing CI run.
