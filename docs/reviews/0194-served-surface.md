# #194: served-surface verification

Historical artwork-only snapshot, before the Codex driver. The current native menu and working
Codex session are verified in [the #195–#196 report](0195-0196-codex-sessions.md).

- Observed on November 11, 2026, using the live Vite development server and Chromium browser harness.
- Baseline: `c5f3decb12f8044eb005e62ee975be575c26451f`; target is the uncommitted artwork slice on
  `feat/codex-support`.
- Page: `http://127.0.0.1:1420/dev/design-system?theme=light` and its `theme=dark` counterpart.
- Scope: the real `AgentMenu` rendered by the existing message-box choices sample, in the app shell.
  The sample's selection callbacks are intentionally no-ops; it is not an authenticated agent session.

## Executive summary

No visual or interaction defect was found in the scoped agent controls across the four cases.

| Severity | Scoped findings |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

| Viewport | Themes | Observed text layout | Observed interaction |
| --- | --- | --- | --- |
| 1440 × 1000 | Light and dark | All four choices fit on one row; every label is untruncated. | Menu opens on click; arrows reach Demo; Escape closes and focus returns to the trigger. |
| 390 × 844 | Light and dark | Agent/project and model/effort form two rows; every label is untruncated. | The same menu and keyboard behavior works without viewport clipping. |

## Observed evidence

- The original orange Claude symbol is visible and undistorted beside the Claude name in the trigger
  and menu row, in both themes. Its measured trigger image is 16 × 16 CSS pixels, and its SVG is
  decorative (`aria-hidden="true"`). Demo still has its flask, not a vendor image.
- The menu is 192 × 71 CSS pixels. Its right edge is 566 pixels on desktop and 234 pixels at the narrow
  viewport, both inside their respective windows. The closed message-box sample is 720 pixels wide
  on desktop and 314 pixels wide at the narrow viewport.
- Each control label's measured `scrollWidth` equals its `clientWidth`. Visual inspection agrees:
  Claude, arden-code, Opus and Default are legible, with no logo/name overlap or clipping.
- In each case, pointer activation opens the menu, Claude remains checked, and two Down-arrow key
  presses move keyboard focus to Demo. Escape closes it. Focus restoration was checked after the
  exit transition; an immediate sample during that transition is preserved separately, not mistaken
  for a lost-focus defect.
- The console-error, uncaught-error and unhandled-rejection hooks recorded no errors in any case.

### Captures

Each pair is a full viewport, not a cropped snapshot hiding surrounding layout.

| Case | Closed controls | Open menu |
| --- | --- | --- |
| Desktop, light | [Capture](0194-artwork-evidence/desktop-light-closed.png) | [Capture](0194-artwork-evidence/desktop-light-open.png) |
| Desktop, dark | [Capture](0194-artwork-evidence/desktop-dark-closed.png) | [Capture](0194-artwork-evidence/desktop-dark-open.png) |
| Narrow viewport, light | [Capture](0194-artwork-evidence/mobile-light-closed.png) | [Capture](0194-artwork-evidence/mobile-light-open.png) |
| Narrow viewport, dark | [Capture](0194-artwork-evidence/mobile-dark-closed.png) | [Capture](0194-artwork-evidence/mobile-dark-open.png) |

[Raw observations](0194-artwork-evidence/observations.json) retain bounds, label widths, selected
states, keyboard focus, immediate/final dismissal state and captured errors for all four cases.
The [manifest](0194-artwork-evidence/manifest.json) records actual PNG dimensions, byte sizes and
SHA-256 hashes for all eight images.

## Round-end consistency

The registry's consumers were traced through the trigger, menu row and `SessionView` header. The only
remaining robot reference in the session UI source tree was the representative `ClaudeBox` layout
fixture in `MessageBox.test.tsx`. An artwork assertion was observed failing there, then the fixture
was changed to use `agentIcons.claude`. The three affected component/app files subsequently passed
42 tests, including the original wrap/Send-row checks; a fresh `pnpm check` also passed.

## Limits and out-of-scope observations

- This is served-browser evidence, not a packaged Tauri/WebView2 or Linux-native smoke test. The
  populated session header uses the same registry and is covered by the app integration tests, but
  was not manually exercised in this no-Rust preview.
- The 390-pixel viewport is below the native window's configured 500-pixel minimum. It checks narrow
  layout robustness, not a promise of a supported mobile application.
- The separate, unchanged Brand gallery extends horizontally at 390 pixels; this remains visible in
  the full captures. The changed agent controls and popup fit. No unrelated gallery redesign was
  made or represented as verified mobile-wide behavior.
- The development sample cannot demonstrate persisted agent selection, real authentication, model
  turns or Codex functionality. Those remain separate implementation and release checks.
- The browser initially needed to wait for route modules/fonts and menu exit transitions. Those
  harness timing issues were resolved by waiting for the actual UI conditions; they are not hidden
  application failures or substitutes for the captured results.

## Delivery state

The first artwork slice remains local and uncommitted. No issue closure, push, remote CI, merge or
complete Codex integration is implied by this report. See the separate
[Standards and Spec review](0194-agent-artwork.md).
