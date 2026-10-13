# Motion: research

- Date: 2026-10-13
- Question: what moves in Arden Code today, how far it is from the decisions (ADRs 0010, 0022, 0023, 0032 and plan
  section 7.4), and what Motion (motion.dev) or the web engine's own CSS would add.
- Read at: the codebase at `15de2be` [CODE]; tw-animate-css 1.4.0 as installed [TW]; motion.dev's documentation [MD];
  the published packages `motion`, `framer-motion` and `motion-dom` 14.1.1, read and not run [PKG]; and Fluent UI's
  `react-motion` API report [FL].

## The answer in short

- **Only overlays move, and four of them are off the range.** Dialogs (and their scrim), the confirm dialog, menus
  (context menus included) and popovers run for 100 ms, outside 120–160 ms. [CODE]
- **Three controls carry `transition-colors`,** which ADR 0022 rules out: the input, the input group and the textarea.
  The classes came with the shadcn copies (`e591148` and later); ADR 0022's "review every copied component" is not
  checked by anything. [CODE]
- **Two spinners turn.** One is in a notice; the other is on the Plugins page's Refresh button, a control outside any
  overlay. Under reduced motion both stop at once and show as a still icon. [CODE]
- **Motion can follow the app's reduced motion, but not through its own reduced-motion option.** That option keeps
  fades; `skipAnimations` on `MotionConfig` stops everything. [MD] [PKG]

## What moves today

| Where | How | Duration | Under reduce |
|---|---|---|---|
| Dialog and its scrim (`ui/dialog.tsx`), `ConfirmDialog.tsx` | fade, zoom from 95% | 100 ms | ends at once |
| Menus, context menus (`ui/dropdown-menu.tsx`) | fade, zoom from 95%, 0.5rem slide from the anchor | 100 ms | ends at once |
| Popovers (`ui/popover.tsx`) | as menus | 100 ms | ends at once |
| Tooltips (`ui/tooltip.tsx`) | as menus | 150 ms (tw-animate-css's default) | ends at once |
| Notices (Sonner, `base.css`) | Sonner's slide and fade | 160 ms, both ways | ends at once |
| A notice's loading icon, Plugins → Refresh | `animate-spin` | 1 s per turn | stops at once |
| Input, input group, textarea | `transition-colors` | 150 ms | ends at once |

[CODE] [TW]. tw-animate-css's `animate-in` and `animate-out` take `--tw-duration` and default to 150 ms and `ease`. [TW]

Nothing else moves. The sidebar and the inspector collapse and expand through react-resizable-panels' `collapse()` and
`expand()`, at once. Thinking and tool-call items, and About's licenses, are native `<details>`. The Verbose transcript
view opens every tool call by setting `open`. The sidebar's lists are plain DOM; the session view and Discover are
virtualized. [CODE]

## Reduced motion in the app

- `AppearanceFromSettings` works out one boolean from the setting (System, On, Off) and Windows' media query, and
  `paintMotion` writes it to the root as `data-motion="reduce"` or `"full"`. [CODE]
- `base.css` then sets every animation and transition, on every element and its `::before` and `::after`, to 0.01 ms,
  one iteration, no delay, and turns smooth scrolling off. The rule reaches CSS animations and transitions only. [CODE]
- **Pseudo-elements other than `::before` and `::after` are not matched** by its `*`: `::details-content` and the
  `::view-transition-*` tree would each need adding. [CODE]
- The unit tests run in Vitest's browser mode, in Chromium, with `global.css` loaded, so a test can read an element's
  computed `animation-duration` (`Toaster.test.tsx` does). [CODE]

## Motion (motion.dev)

- **Package:** `motion` 14.1.1, published 2026-10-13; 14.0.0 came out on 2026-10-02 and 14.1.0 on 2026-10-09. It
  depends on `framer-motion`, which depends on `motion-dom` and `motion-utils`; `tslib` besides. MIT. [PKG]
- **React:** `motion/react`. `LazyMotion` with the `m` components loads features on demand: 4.6 kB to start,
  `domAnimation` (animations, variants, exit animations, gestures) adds about 18 kB, `domMax` (that, plus drag and
  layout animations) about 28 kB. [MD]
- **`reducedMotion` on `MotionConfig`:** `"user"` follows the device's setting, which in the web engine is the
  `prefers-reduced-motion` media query, not the app's attribute; `"always"` and `"never"` force it. When it applies,
  **transform and layout animations stop; opacity and color animations still play.** [MD]
- **`skipAnimations` on `MotionConfig`:** "If true, all animations will be skipped and values will be set instantly.
  Useful for E2E tests and visual regression testing." Public in the package's types; the same flag exists on
  `animate()`'s options and as `MotionGlobalConfig.skipAnimations`. [PKG]
- **But it does not reach a layout animation.** With it on, a sidebar row moved by `layout` still slid from 16 px to
  its place over about ten frames. Motion makes a layout animation instant only when `reducedMotion` applies to the
  element (`shouldReduceMotion` in `motion-dom`'s projection node), so stopping everything takes both. [TRY] [PKG]
- **Where Motion runs its animations:** some through the browser's animation API, layout animations on its own frame
  loop. Neither is reached by `base.css`'s rule. [MD] [PKG]
- **What it does that CSS cannot:** animate an element that React removes (`AnimatePresence`), and move an element
  from where it was to where a render put it (`layout`). [MD]

## What CSS can do in WebView2

Evergreen WebView2 (ADR 0004) follows Chromium's stable release, which has the following, from Chromium's
documentation; the disclosures were tried in the app's test browser while building them (#164, below).

- `@starting-style` and `transition-behavior: allow-discrete`: entering and leaving through `display` or
  `content-visibility`, as a disclosure or a popover does.
- `interpolate-size: allow-keywords` with `::details-content`: a native `<details>` that opens and closes to its
  content's height.
- Same-document View Transitions: a change drawn as a cross-fade or a move between two snapshots of the page, with a
  unique `view-transition-name` on every element that moves.

What trying `::details-content` showed [TRY]:

- **It moves only from a state the browser has drawn.** A rule given to a closed `<details>` in the same click that
  opens it does nothing; the rule has to be there from the start, while the disclosure is drawn closed.
- **Its transition is invisible to scripts.** `getAnimations()`, on the element or the document, does not list it,
  and no `transitionrun`, `transitionstart` or `transitionend` event reaches the `<details>`. Tests read the height it
  is drawn at instead, through `getComputedStyle(details, "::details-content")`.
- **A change made in code shows at once when the move is held off for it:** with the transition property set to
  `none`, the new state's style worked out once, then the transition put back, there is nothing left to animate.
- **Tailwind's `duration-*` also sets `transition-duration`,** and an unset `transition-property` is `all`, so it made
  every change to an overlay's own properties, its shadow among them, a transition too. tw-animate-css's
  `animation-duration-*` times the animation alone.

## Windows' own pace

Fluent 2's motion tokens, from `@fluentui/react-motion` [FL]:

| Token | Value |
|---|---|
| `durationFaster` | 100 ms |
| `durationFast` | 150 ms |
| `durationNormal` | 200 ms |
| `curveDecelerateMid` | `cubic-bezier(0, 0, 0, 1)` |
| `curveDecelerateMax` | `cubic-bezier(0.1, 0.9, 0.2, 1)` |
| `curveAccelerateMin` | `cubic-bezier(0.8, 0, 0.78, 1)` |
| `curveAccelerateMid` | `cubic-bezier(1, 0, 1, 1)` |
| `curveEasyEase` | `cubic-bezier(0.33, 0, 0.67, 1)` |

## Sources

- [CODE] `apps/desktop/src` at `15de2be`: `components/ui/*`, `components/ConfirmDialog.tsx`, `components/Toaster.tsx`,
  `components/layout/AppShell.tsx`, `features/plugins/DiscoverTab.tsx`, `features/sessions/items/*`,
  `lib/appearance.ts`, `styles/base.css`.
- [TW] `node_modules/tw-animate-css/dist/tw-animate.css`, 1.4.0.
- [MD] [motion.dev: accessibility](https://motion.dev/docs/react-accessibility),
  [MotionConfig](https://motion.dev/docs/react-motion-config), [LazyMotion](https://motion.dev/docs/react-lazy-motion).
- [PKG] `framer-motion` 14.1.1 `dist/index.d.ts` (`MotionConfigContext.skipAnimations`), `motion-dom` 14.1.1
  (`animation/interfaces/motion-value.mjs`), npm's publish times.
- [FL] [Fluent UI `react-motion` API report](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-motion/library/etc/react-motion.api.md).
- [TRY] Tried in Vitest's browser mode (Playwright's Chromium headless shell) while building #161, #164 and #165.
