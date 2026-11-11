# #195–#196: native Codex readiness and read-only sessions

- Observed: November 11, 2026, on Windows.
- Baseline: `c5f3decb12f8044eb005e62ee975be575c26451f`; uncommitted `feat/codex-support`.
- Scope: the initial readiness/session slices, not completion of parent #193 or PR CI.
- Method: one agent. Runtime verification below occurred before the separate static review; it is
  not an independent security audit or a static-review execution receipt.

## Result

Codex is now a real selectable agent, not an installation-only Settings row. The app resolves the
native executable behind the installed npm wrapper, checks startup/account readiness without a
model turn, and runs authenticated replies through the person's own `codex app-server`.

The CLI was already signed in. No credentials were requested, copied into Arden Code or put into
these artifacts. The real probes used isolated owned folders, not the maintainer's project files
or normal Arden data profile. Codex retains its own history in the ordinary way.

## Observed native evidence

The rebuilt native application, not a browser-only sample or protocol stand-in, was launched with
an isolated data profile and the actual installed Codex 0.167.1 on PATH.

- Settings discovery returned installed/ready/signed-in and a native `codex.exe` path.
- Codex appeared and was checked in the actual agent menu. Its original supplied OpenAI artwork is
  visible, with a light backing for contrast rather than changed source artwork.
- At 1440 × 1000 and 390 × 844, in light and dark themes, the menu stayed inside the viewport.
  Agent/read-only/project labels were readable; the project choice wraps onto the second row in
  the narrow case. Arrow keys reached Demo, Escape dismissed the menu and DOM focus returned to
  `Agent: Codex` after the transition. No renderer error was captured.
- The sidebar was collapsed. The 390-pixel case is viewport emulation below the native 500-pixel
  minimum, not a claim of a supported mobile app or a 390-pixel physical native window.
- A proof file was created only inside the isolated Playground. Its randomized first line was not
  included in the prompt. The native Codex session read it and returned that exact line. The reply
  ended, retained the Codex identity/read-only badge and showed no error.
- A separate real-CLI test sent a confirmation, reopened the saved store with a fresh driver/server,
  and obtained the previous confirmation again without including it in the second prompt.

[Native observations](0195-0196-codex-evidence/observations.json) and the
[PNG/build manifest](0195-0196-codex-evidence/manifest.json) retain four cases, nine screenshots,
actual dimensions, hashes and the tested native executable's hash. The proof string is test data,
not an authentication token.

## Defects found and corrected during verification

1. The old UI had only Claude and Demo because Codex had no registered session driver. The shared
   kind/driver/icon/menu seams now include Codex; it is offered only when native readiness is ready.
2. Claude-only folder trust would have let Codex bypass the trust step. Both the UI gate and Rust
   store now require trust for a non-Demo coding agent. Codex gets its own explanation.
3. The old final fallback was a Claude-installed boolean. It now accepts an agent kind selected by
   discovery: preserve explicit/inherited choices, otherwise installed Claude, ready Codex, then
   Demo. Existing inheritance and before-first-message rules remain intact.
4. App-wide supervision alone left inherited pipes alive after a server kill. The regression failed
   before per-connection scopes and passed after the whole owned process tree was ended first.
5. `untrusted` pacing requested command approval for the native file read. The safe failure was
   retained, not auto-approved. A two-policy live probe established native `never` pacing with the
   same read-only/network-disabled sandbox; the initial slice now uses and verifies that policy.
6. UI verification harness issues were corrected without changing app behavior: supply the required
   `fresh` argument; build the bundled native executable after workspace tests; navigate from the
   actual menu focus state rather than assuming one Down arrow already reaches Demo.
7. A hidden Claude Ultrathink switch survived an agent change and altered Codex messages. Two
   app-level tests failed with the unwanted suffix, then passed after both message entry points
   gated the shared preparation. A Codex send neither applies nor consumes the Claude choice.
8. The shared file picker offered unverified mention syntax and could swallow Enter on a literal
   `@README.md`. Two app-level tests failed before Codex stopped receiving that picker. Plain text
   remains unchanged; native file-input support stays in #200 rather than being implied by the UI.
9. The old native Settings test expected an arbitrary `codex.cmd` to supply a version. It now checks
   wrapper-only incompatibility, then native initialization/account readiness through the owned
   protocol stand-in. The changed E2E case passed ten times with retries disabled. The normal debug
   build now builds that fixture too, so the test does not depend on an earlier workspace test run.

## Verification

- `pnpm check`: passed after the input fixes, including 933 desktop tests, 46 brand tests, Rust
  tests, formatting, lint, type checks, dependency directions, translations and Rust Clippy.
- `pnpm brand:check`: passed separately; generated Arden branding was unchanged.
- New native-process regression suite: 13 passed, repeated ten times — 130 passed, zero failed.
  The ignored account test was deliberately not included in those repetitions.
- Real signed-in store/driver restart-resume test: explicitly run and passed after the pacing fix.
- Real two-policy read-only capability probe: explicitly run; command approval under `untrusted`,
  successful file read under `never`, read-only/network-disabled sandbox in both cases.
- New Codex menu/logo visual cases: 20 repeated cases passed; full visual suite: 12 passed.
  The artwork crops use zero pixel-difference tolerance and were visually inspected.
- `pnpm --filter @arden/desktop build:debug` with `CI=true`: passed; actual native UI and file-read
  smoke passed against that standalone bundled build after the full check.
- Final native E2E run against the latest frozen bundled build: 122 passed, zero failed/flaky,
  retries disabled. The maintainer attributed foreground/cursor interference to their own input
  and requested those checks be skipped. Exactly three cases were excluded for this run: real
  title-bar toggle clicks, foreground-dependent Window-menu positioning, and real corner dragging.
  No assertion or permanent test skip was added. Six debug-configured skips remain separate: two
  performance checks and four release-only browser/shortcut checks. See the
  [parsed native result](0195-0196-codex-evidence/native-e2e-summary.json).
- Earlier full native runs were not green: 121 passed/four failed, then 123 passed/two failed. The
  Settings fixture was corrected and passed ten repetitions; the final exclusions above reflect
  the maintainer's direction, not a claim that mouse-input failures were fixed.
- The complete Rust workspace run passed 588 tests, with three opt-in tests ignored by default;
  the separately executed Codex account probes are reported above. Release/installer/performance
  suites and Linux runtime/CI were not run on this Windows debug build.

## Sequential source review

### Standards

One-agent pass against `CLAUDE.md`, `CONTRIBUTING.md`, the glossary and the accepted ADRs; automated
style/type/test rules are reported above rather than duplicated as review findings. The new RPC
seam owns framing, queues and I/O workers; `ActiveTurn` keeps native ids with their owning client;
the existing supervisor owns scoped lifetime rather than introducing a second process framework.
No unresolved documented coding-standard violation was identified in the examined changes.

Generated IPC bindings retain the generator's canonical output: the committed-bindings contract
passes. A raw `git diff --check` reports generator-produced trailing spaces in that file; it is not
hand-formatted to hide the warning. This is distinct from the passing project formatting gate.

### Spec

A separate subsequent pass against the local #193 spec and #194–#196 ticket graph found the hidden
Ultrathink transfer, unverified mention picker and stale glossary id assumption. Those were
corrected; the two input behaviors have RED/GREEN tests at both message entry points. The initial
selection/readiness/read-only/save/resume slice matches its declared boundary, not all 38 parent
stories. #197–#202 remain explicitly incomplete, including cross-platform and release acceptance.

These are sequential assessments by the same agent, not independent approvals. The security
plugin's source review is a separate artifact and does not inherit runtime confirmation from the
tests above. No merge-readiness conclusion follows from these local reports.

## Remaining boundaries

This is fixed read-only support, not Claude parity or completion of #193. Interactive approvals,
additional permissions, questions, full tool/file-change presentation, native model/effort choices,
figures, skills and plugin gates remain in #197–#202. Unsupported authority-bearing requests fail
closed with a visible code; a missing checkpoint never silently starts a replacement conversation.

There is no Linux runtime evidence or Windows/Linux PR CI from this local run. No issue was closed,
commit made, push performed, PR opened or merge attempted. The old #194 served-surface report is a
historical artwork-only snapshot, not the current menu's agent inventory.
