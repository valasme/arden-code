# 0054. What moves, and how

- Status: Accepted
- Date: 2026-10-13
- Changes "motion on overlays only" in [0010](0010-visual-design-system.md), [0022](0022-high-contrast-and-component-adjustments.md)
  and [0032](0032-the-redesign.md), and the reduced motion rule of [0023](0023-zoom-and-the-root-size.md); adds Motion
  to [0006](0006-frontend-stack.md)'s stack; changes plan sections 5.3, 7.4 and 10.

## Context

The maintainer asked to improve, add and polish the app's motion, and suggested Motion (motion.dev). [The
research](../research/motion.md) found that only overlays move, but four of them at 100 ms, outside the 120–160 ms of
plan section 7.4; three controls still carried `transition-colors`, which ADR 0022 rules out; and two spinners turned,
one of them on a control, both stopped dead under reduced motion. Nothing checked any of it. ADR 0022's "review every
copied component" had been missed by each shadcn copy since.

Motion's own `reducedMotion` option stops transforms and layout animations but keeps fades, and it follows Windows'
media query rather than the app's setting. Its `skipAnimations` flag stops everything. [The
councils](../research/motion-councils.md) weighed each choice.

## Decision

- **An overlay opens in 160 ms and closes in 120 ms.** The range of plan section 7.4 stands; these are its two ends, as
  tokens in `tokens.css` with Fluent 2's curves: decelerate-mid (`cubic-bezier(0, 0, 0, 1)`) to open, accelerate-min
  (`cubic-bezier(0.8, 0, 0.78, 1)`) to close. Menus, popovers and tooltips fade and slide 0.25rem from their anchor;
  dialogs fade and scale from 98%; the scrim fades; notices slide and fade as Sonner draws them. Closing is a fade. No
  zoom.
- **Two more things move.** A disclosure (thinking and tool-call items, About's licenses) opens to its height and
  closes, when the person opens or closes it; a transcript view change and a session that opens show it as it is. A
  sidebar row moves to its new place when its session is pinned, unpinned or moved up by use; comes in when it is
  created or unarchived; and fades out when it is archived or deleted, or its project removed. Search results show at
  once. Nothing else moves: not
  the sidebar or the inspector, not pages or tabs, not a new turn (ADR 0049), not controls (ADR 0022).
- **CSS animates what has an open or closed state in the page; Motion animates what React adds, removes or moves.**
  Overlays keep tw-animate-css, disclosures use `::details-content`, and the sidebar's rows use Motion (`motion`, with
  `LazyMotion`, `domMax` and `strict`). A Motion transition is written only in `lib/motion.ts`, from the same values
  as the tokens.
- **Reduced motion still ends every animation at once,** in CSS through `data-motion="reduce"` (with
  `::details-content` added) and in Motion through `skipAnimations`, set from the same value at the root. Motion's
  `reducedMotion` option is not used. A row on its way out is `inert`, and the focus moves on at once.
- **Spinners are the one exception.** `animate-spin` turns wherever something is waited on, also under reduced motion:
  it is the only sign that work is still going, and it turns in place.
- **The rules are checked.** A browser test checks every overlay's durations against the tokens and that nothing but a
  spinner runs under reduced motion. A source check fails on a transition, duration, easing or animation class outside
  the overlay components, and on a Motion transition outside `lib/motion.ts`.

## Consequences

- A disclosure moves only after the person's own click or key, so its transition is switched on by that event, not
  by `open` changing; a transcript view change sets `open` without it.
- Motion is four packages from npm, held back two days like every other (ADR 0020), and about 33 kB at start.
- The maintainer, who uses reduced motion, reviews this work with Reduce motion set to "Do not reduce".
- A copied shadcn component that brings its own transition fails CI instead of waiting for a review to notice it.
