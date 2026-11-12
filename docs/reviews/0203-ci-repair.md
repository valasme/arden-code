# PR #203: CI repair investigation

## Initial observations (before GitHub logs recovered)

The first CI run, `43090308221`, tests head
`184b061312fcb32178be64412428fe7b829ed52f`.

- **Audit:** spelling passed. Cargo-deny failed on `libsqlite3-sys 0.38.2`
  (`RUSTSEC-2026-0459` / `CVE-2026-119375`) and yanked `async-executor 1.14.0`.
  The lockfile was identical to `main` before these repairs; no new ignore is appropriate.
- **Linux:** the Rust test step failed with exit 101. GitHub's job-log endpoint repeatedly returned
  HTTP 502; the whole-run/attempt log archive was unavailable. The public web page exposed the
  failed step but no log content while signed out. The exact failed test is therefore not known
  yet; this report does not invent one or label Linux fixed by the dependency update.
- **Windows:** the job API listed successful build, native E2E, performance and post-job steps,
  including successful Complete job, while its header and the run summary still said in progress.
  A cancellation request was rejected as already completed; a Linux-only rerun request was also
  rejected. No cancellation or rerun succeeded. This is inconsistent GitHub status, not evidence
  of a hung Arden process. A new PR head needs fresh observed Windows/Linux checks.

## Dependency repair: red to green

The official CI-matching cargo-deny 0.20.2 and typos 1.50.3 binaries were downloaded into owned
scratch storage and checked against the official release asset SHA-256 values. No global
credential/tool configuration was changed.

The unchanged lockfile reproduced both Audit failures locally. The upstream
[RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0459.html) identifies
`libsqlite3-sys >=0.39.0` as patched for the bundled SQLite case. The supported `rusqlite` 0.41
line resolves to 0.41.1 with `libsqlite3-sys` 0.39.1. Both were published in October, rather than
selecting the newly published 0.42 release. The yanked executor resolves to 1.14.1, published
November 2. Registry publication/yank metadata and upstream release notes were checked.

The manifest and generated Cargo lockfile now resolve:

- `rusqlite 0.41.1`;
- `libsqlite3-sys 0.39.1`;
- `async-executor 1.14.1`.

The resolver also refreshed compatible Windows dependency edges without changing those package
versions. The generated license inventory was rebuilt rather than hand-edited. Fresh spelling,
all-features cargo-deny advisories/bans/licenses/sources, and license-inventory checks passed.
Existing duplicate-version warnings remain warnings under the unchanged policy.

## Local animation-test race

A fresh full check exposed an additional sidebar animation sampling race: the test awaited the
interaction before recording frames, so it could miss the whole 120ms exit. A deterministic
regression waited until the row had gone before resolving the interaction; the old sequencing
failed with zero fading frames. Recording starts before the interaction now, at every relevant
pin/archive/remove/reduced-motion call site. Opacity, removal and accessibility assertions are
unchanged. Production animation timings and retries were not changed.

The nine-case motion suite passed ten separate executions (90 tests). The fresh full check then
passed 934 desktop tests, 46 brand tests, the Rust workspace, Clippy, formatting, lint, types,
translations, architecture checks and bindings contract. Full visual suite: 12 passed; brand
outputs and bundled debug build passed. Earlier failing runs remain failures, not passing retries.

## Linux diagnostic transport

The Linux Rust test step now retains stdout/stderr with `tee` and uploads the failure log as
`rust-test-results-linux`. Explicit `shell: bash` supplies GitHub's fail-fast/pipefail invocation;
a probe with a failing producer verified that tee cannot turn a failing test into a passing step.
No test exclusion, retry increase or approval/advisory bypass is introduced.

The extra artifact is diagnostic transport, not a fix for the as-yet unread Linux test failure.
Windows/Linux CI and a new authorized native E2E run remain required before claiming this repair
complete. The earlier screenshot/native receipts remain historical and are not rebound to the
new dependency build.

## Recovered Linux cause and deterministic repair

On resuming, GitHub finally served the original Linux job's failed-step output through
`gh run view 43090308221 --job 130765300286 --log-failed`. It identifies
`malformed_protocol_and_weakened_native_policy_are_coded_failures`: the malformed-output case
produced `CodexStopped` instead of the expected `CodexNotUnderstood`. The Windows job's completed
check now reports success, confirming that the earlier in-progress summary was stale.

The transport sent terminal results from both its stdin writer and stdout reader into one queue.
A child can write malformed output and close stdin before the parent's initialize write. The
writer's broken-pipe error then races the reader's protocol error. The former maps to stopped,
so the displayed error depended on worker scheduling rather than the bytes the child returned.

The existing worker startup was extracted without a behavior change for a deterministic regression:
an input that fails with BrokenPipe and an output reader blocked by a channel gate. The test waits
for the writer to finish failing before releasing malformed buffered output. The unchanged
implementation failed with `Disconnected` versus `Protocol`, exactly the original CI mismatch.
The second case checks that empty stdout still produces `Disconnected`.

Only the stdout reader now publishes terminal results. The writer closes a broken stdin and
drains its existing bounded input queue until Client drops, rather than disconnecting the queue
and letting a subsequent send race the same buffered result. An outstanding call still ends on
stdout EOF, protocol error, cancellation or its existing deadline. No timeout or frame/queue limit
was increased. The owned process scope and worker joining remain unchanged.

The regression passed after the fix; the real supervised process suite passed all 13 ordinary
tests, then passed ten separate full executions. The live account/model test remains explicitly
opt-in, not newly skipped. A fresh complete `pnpm check`, 12-case visual suite, brand/license
checks, spelling, full all-features deny check and bundled debug build passed after this repair.
No Linux runtime success is inferred from these Windows-host results; fresh CI remains required.

## Final local verification before pushing

After the transport fix, `pnpm check` passed with **934 desktop + 46 brand tests**,
**589 Rust tests passed / 0 failed / 3 existing opt-in ignores**, Clippy and the remaining checks
listed above. Full visual suite: **12 passed**. Full all-features deny check:
`advisories ok, bans ok, licenses ok, sources ok`. Brand, license inventory, spelling and bundled
debug build passed. The frozen native executable SHA-256 is
`32a776f4c77990c33e2d26289fa86bbb57a4999264e4b60cface26c754baebc7`.

The authorized fresh native E2E run finished with exit 0: **122 passed / 0 failed / 0 flaky**,
**6 existing debug skips**, retries **0**, in 8.2 minutes. Its JSON has no runner errors.
The same three maintainer-authorized OS cursor/foreground exclusions were command-line only:
title-bar real clicks, Window-menu positioning, and corner dragging. They are separate from the
six skips; CI still runs the unfiltered suite. The interrupted previous repair run produced no
receipt and is not counted as passing. Local release/performance gates remain for PR CI; no fresh
live-account model turns were made for this CI repair.

At this local checkpoint `main` is an ancestor of the branch. Fresh latest-head remote checks,
including Linux runtime and Windows release/performance, are still required; nothing was merged.

## Sequential review before the diagnostic push

### Standards

One-agent source pass against the repository conventions, separately from runtime verification.
The dependency requirement retains the manifest's style; upstream fixes replace vulnerable/yanked
versions rather than weakening deny policy. Cargo and the license generator produced their
respective outputs. The test-only frame observer is reused at the related call sites, retains
all existing accessibility/removal assertions and changes no production timing. The workflow's
explicit Bash shell preserves pipefail; artifacts contain the same deterministic-test output
already intended for the CI log and use the existing fourteen-day retention convention.
No unresolved documented-standard violation was identified in this repair delta.

### Spec

A subsequent pass against the request to diagnose/fix PR checks separates established causes from
missing evidence: Audit and both scheduling races have failing-then-passing local evidence. The
recovered original Linux error is now tied to the deterministic transport regression, but remote
Linux/Windows success on the repair is still required. The artifact supplements, rather than
replaces, the normal failing Rust step. Windows completion is confirmed by its completed check,
not a claimed successful cancellation. These changes add no Codex feature scope and close no
issue or merge gate. Both assessments are by the same agent, not independent approvals.

### Standards refresh for the recovered Linux failure

Read the actual transport diff and adjacent call, cancellation, detection and drop paths after the
initial review. The private worker-start seam exists to exercise the actual worker code rather
than change a test expectation or add a fake protocol client. Both readiness and session replies
still share the same Client. Output remains private; the parser, limits, approval policy and
scope ownership are unchanged. Waiting for stdout after a write fault is bounded by the existing
call deadline, and cancellation still polls independently of stdin. The regression gates ordering
with channels, not a sleep or retry. No additional documented-standard violation was identified.
The previously sealed focused security scan predates this transport repair and is not a seal for
the changed code; this refresh is a source review, not an independent security audit.
