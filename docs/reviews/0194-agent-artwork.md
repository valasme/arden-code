# #194: agent artwork review

- Baseline: `c5f3decb12f8044eb005e62ee975be575c26451f`.
- Target: uncommitted working-tree changes on `feat/codex-support`, including the new renderer,
  imported originals and focused visual baselines. No commit or merged implementation is implied.
- Method: one agent, separate sequential Standards and Spec passes as required by `CLAUDE.md`.

## Standards

Result: no unresolved findings in the reviewed artwork slice.

Sources: `CLAUDE.md`, `CONTRIBUTING.md`, the glossary, the plan and ADR 0064. The tracked diff and
new renderer were inspected against the baseline, including new assets and generated outputs.

- The shared icon registry changes one existing consumer seam rather than duplicating menu/header
  rendering. The renderer is a small adapter for the existing icon interface, not a new UI framework.
- The original SVG is imported as an image. No copied path data, HTML injection, recoloring, new
  dependency, credential handling or runtime asset-upload surface is introduced.
- Visible UI text and accessible names are unchanged; Demo retains its existing icon. The supplied
  file has no script, foreign-object or external-resource element. Existing CSP permits local/data
  images; it was not weakened for this change.
- The first rendering assertion was observed failing before production changes, then passing.
  New focused screenshots cover both themes with zero pixel-difference tolerance; each changed
  screenshot case passed ten times. The screenshots were inspected visually.
- `pnpm check`, the production web build, full visual suite, contract-drift check and brand-output
  check passed. Existing build chunk-size and Vitest plugin-hook advisories were not hidden or
  addressed through unrelated dependency/configuration changes.
- No baseline code-smell heuristic identified a material problem in this small change. Accepted ADR
  bodies remain history; active policy notes point to the explicit superseding decision.

This pass is not an independent audit or a claim of Windows/Linux PR CI. No commit/push/merge has
occurred, and the broader Codex driver is outside this slice.

## Spec

Result: all seven local acceptance criteria of issue #194 are implemented and locally verified;
the issue remains open pending the repository's commit/PR/CI delivery requirements.

This pass was performed after Standards, against the freshly read issue body and comments rather
than treating the whole Codex spec as already implemented.

1. The registry supplies the original artwork to both the existing agent menu and session header.
   Menu and app integration tests assert the source image and preserve the existing visible names.
2. SHA-256 comparisons confirm all four source originals remain identical to Downloads. The renderer
   uses a bundled image URL, not HTML injection or reconstructed paths; the SVG has no external input.
3. Existing accessible names, decorative `aria-hidden`, keyboard selection and Demo's flask are
   covered by the passing menu/app tests. Moving icon-shape helper rendering before asynchronous
   interactions also avoids the stale helper's act warnings in the updated assertions.
4. The focused light/dark images were inspected, show the unaltered symbol without clipping, and
   passed ten repetitions per theme. The full visual suite passed; generated brand files and the
   app's original icon remain unchanged.
5. The supplied OpenAI files are retained unchanged. No Codex domain value, agent choice or driver
   was added by this ticket, so it exposes no nonfunctional early agent.
6. The initial assertion failed because the artwork was absent, then passed after the minimal
   renderer/registry change. Full checks passed: 916 desktop tests and 46 brand tests, Rust tests
   and clippy, formatting/lint/typecheck and the remaining `pnpm check` gates. The production web
   build, ten visual tests, twenty repeated affected visual cases, bindings and brand checks passed.
7. Active plan/vendor/asset notes distinguish the implemented Claude artwork from the pending Codex
   integration and exclude third-party artwork from the MIT grant. Accepted ADR bodies were not edited.

No requested local behavior was omitted and no unrelated runtime feature was added. Linux execution,
native end-to-end packaging and remote PR CI are not established by these local UI/build results.

## Served-surface follow-up: Standards

Result: no unresolved Standards findings in the follow-up delta.

The round-end call-site inspection found that `MessageBox.test.tsx` still drew a robot in its
representative Claude layout. A new assertion was observed failing on that fixture before it was
changed to `agentIcons.claude`. This reuses the production registry instead of maintaining a second
agent-icon mapping; the existing wrapping/Send-row checks now exercise the actual artwork renderer.
No runtime code, source artwork, dependency, accessible name or native capability changed in this
follow-up. The focused three-file suite passed 42 tests, followed by a fresh passing `pnpm check`
(916 desktop tests, 46 brand tests, Rust tests/clippy, formatting, lint, typecheck and other gates).
The existing Vitest plugin-hook advisory remains visible.

This is a sequential same-agent pass against `CLAUDE.md`, `CONTRIBUTING.md`, the original baseline
and the small fixture diff, not an independent review. The earlier sealed static security scan
remains evidence for its original artwork scope; the additional test-only fixture change was
inspected separately and is not retroactively represented as part of that scan.

## Served-surface follow-up: Spec

Result: no unresolved Spec findings in the follow-up delta.

After the Standards pass, issue #194 was checked separately against the fixture correction and
[served-surface evidence](0194-served-surface.md). The fixture now represents the supplied artwork
required by criterion 1 rather than a stale substitute. The four live-browser cases directly
support criteria 3 and 4 for the agent controls: unchanged names and Demo's icon, readable original
artwork, menu opening/keyboard navigation/dismissal and post-transition focus return. The separate
session-header evidence remains the app integration tests, not this no-Rust preview.

Criterion 6 was rechecked after the fixture update: 42 focused tests and all `pnpm check` gates
passed; the two affected visual cases passed ten repetitions each, then all ten visual tests
passed. The first visual rerun was blocked by the reviewer-owned preview server under the existing
CI reuse policy; stopping that server and letting Playwright own its server resolved the setup
conflict without changing the application or test configuration. There were no failing assertions
in the subsequent visual runs.

The retained source files and runtime code did not change in this follow-up. The native minimum
window width, the narrow preview's unrelated Brand-gallery overflow, absence of a real selection
callback in the sample, and untested native/authenticated flows are explicit evidence limits, not
claims of new mobile support or complete Codex delivery. No additional runtime scope was added.
