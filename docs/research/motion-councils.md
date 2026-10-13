# Motion: the councils

- Date: 2026-10-13
- Input: the maintainer's request (below), [the research](motion.md), ADRs 0004, 0006, 0010, 0019, 0020, 0022, 0023,
  0024, 0032, 0040, 0049 and 0051, plan sections 5.3, 6.11, 7.4, 10 and 11, and the codebase at `15de2be`.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides, by the same
  25 roles: product (P), experience (E), architecture (A), reliability (R) and delivery (D). Where a role objected, the
  objection is kept with what settled it. The maintainer asked for the council workflow, so each question has a
  verdict. The first round of the interview (`/grill-with-docs`) had a recommendation for each question; it was weighed
  as the first option, and one was changed (Q7).

## The request

"We want to improve, add and polish the app's animations." The maintainer gave the starting facts: motion is decided in
ADRs 0010, 0022 and 0032 and plan section 7.4 (120–160 ms, overlays only, no transitions on controls, all off under
`data-motion="reduce"`, ADR 0023), and motion anywhere else needs a superseding ADR; dialogs, the confirm dialog, menus
and popovers have drifted to 100 ms, and the input, the input group and the textarea carry `transition-colors`; ADR
0049 records that the maintainer uses reduced motion; and the reduce rule is CSS only, so a JavaScript motion library
would bypass it. They suggested Motion (motion.dev), and after the first round: "using motion.dev is a great idea".

## Round 1

### Q1. What an overlay is

- **Architecture:** A1 three ADRs (0010, 0022, 0032) and plan section 7.4 rest on the word, and the glossary does not
  have it, so "overlays only" cannot be checked against anything.
- **Product:** P5 the sidebar and the inspector are areas (F6 moves between them, ADR 0024) that push the session view
  aside; they do not cover it.
- **Experience:** E5 "modal" names only the overlays that hold the focus; "flyout" is WinUI's word, which no screen of
  Arden Code uses; "popup" says nothing. E5 the app's word for a toast is "notice" (plan sections 6.3, 6.7, 6.8 and 6.11,
  and the region "Notices (Alt+T)"), which the glossary lacks too.

**Verdict:** **Overlay** and **Notice** go in the glossary, under The window. An overlay is something drawn over the
window for a short time, which then closes: a dialog, a menu (a context menu included), a popover, a tooltip or a
notice. The command palette is one.

### Q2. The drift

- **Delivery:** D1 bringing the code back to the decisions needs no ADR. It lands first, on its own, so the new motion
  starts from code that follows the rules. D2 it is small, and CI checks it.
- **Experience:** E2 at 100 ms a menu's fade is hardly seen, and it is outside the range.
- **Reliability:** R1 the test helpers (`animationsDone`, `menuClosed`) wait for the animations, not for a time, so a
  longer duration does not make them flaky.

**Verdict:** yes, as the first ticket and pull request. The values come from Q3 and Q4.

### Q3. How long an overlay moves

Options: **(a)** 150 ms everywhere; **(b)** 160 ms to open and 120 ms to close, from two tokens; **(c)** each component
as it is, within the range.

- **Experience:** E1 a closing overlay is in the way of what the person turns to next, so it leaves faster than it came.
  E4 Fluent 2's `durationFast` is 150 ms, inside the range.
- **Architecture:** A4 (c) is how the drift got in: a duration written in each component, copied from shadcn. Tokens in
  `tokens.css` are one place to read and to test.
- **Product:** P5 (b) keeps ADR 0010's range, so it needs no ADR of its own.

**Verdict: (b).** Opening takes 160 ms and closing 120 ms, for every overlay, notices included (their 160 ms both ways
becomes 160 in and 120 out).

### Q4. How an overlay moves

Options: **(a)** menus, popovers and tooltips fade and slide a little from their anchor, with no zoom; dialogs fade and
scale slightly; the scrim fades; opening decelerates and closing accelerates; **(b)** shadcn's fade and zoom from 95%,
as they are.

- **Experience:** E4 Windows 11's menus and flyouts fade and slide a little from where they were opened; they do not
  zoom. E2 a zoom from 95% is the most visible part of shadcn's motion; a dialog that scales from 98% settles into
  place without seeming to grow. **E2 dissents** on the slide's length: shadcn's 0.5rem reads as a drop. Settled:
  0.25rem, which follows the zoom like every other size (ADR 0023). E1 closing is a fade only: the overlay is leaving,
  and a direction says nothing.
- **Experience:** E4 the curves are Fluent 2's: decelerate-mid, `cubic-bezier(0, 0, 0, 1)`, to open; accelerate-min,
  `cubic-bezier(0.8, 0, 0.78, 1)`, to close. Accelerate-mid holds still and then jumps, which at 120 ms reads as no
  fade at all.
- **Reliability:** R1 an overlay's resting place does not change, only the way there.

**Verdict: (a),** with a 0.25rem slide, dialogs from 98%, closing as a fade, and Fluent 2's two curves as tokens beside
the durations. The maintainer compares one menu and one dialog with Windows 11's own (Q18).

### Q5. What reduced motion means

Options: **(a)** as ADR 0023 says: every animation and transition ends at once; **(b)** reduce keeps fades and removes
slides and scales.

- **Product:** P1 the owner uses reduced motion (ADR 0049), and Streamdown's word fade was turned down partly because
  it ignored it. **P2 dissents** for (b): a fade carries no movement, and some platforms keep fades when motion is
  reduced. Settled: the person who chooses Reduce asked to "play fewer animations" (the setting's own words), ADR 0023
  promises that everything ends at once, and `Toaster.test.tsx` already checks that promise.
- **Experience:** E3 what reduced motion protects against is movement and scaling, which both options remove. An
  overlay that appears at once is still announced and still holds the focus; (a) loses no information.
- **Architecture:** A4 (a) is one rule. (b) is a rule per property, in CSS and in Motion, and it is exactly what
  Motion's own `reducedMotion` option does, which Q11 turns down for that reason.

**Verdict: (a).** ADR 0023's rule stands, with the one exception of Q6.

### Q6. Spinners

Options: **(a)** a named exception: a spinner turns wherever something is waited on, also under reduce; **(b)** allowed
anywhere, but still under reduce, with the wait shown another way; **(c)** overlays only, the Refresh spinner removed.

- **Experience:** E3 a spinner is the one motion that carries information: work is still going. Stopped, it looks like
  an app that has hung. It turns in place, at 16 px, and travels nowhere. **E2 dissents** for (b): an exception weakens
  ADR 0023's promise. Settled: the exception is one utility (`animate-spin`), named in the ADR and in `base.css`, and a
  test (Q17) fails on any other animation under reduce.
- **Product:** P1 with reduce on, the owner sees a still icon today while Plugins → Refresh runs. P2 for (c): without
  the spinner, Refresh seems to do nothing for the seconds `claude plugin list` takes.
- **Reliability:** R4 a spinner turns by `transform`, only while something is waited on, so idle CPU stays at 0% (plan
  section 11).

**Verdict: (a).** Spinners turn wherever something is waited on, also under reduce. This is the only exception to the
reduce rule.

### Q7. Where else things move

The candidates: (1) disclosures opening and closing (thinking and tool-call items, About's licenses); (2) the inspector
and the sidebar showing and hiding; (3) the sidebar's rows moving to a new place or leaving; (4) switching pages or
tabs; (5) a new turn in the session view; (6) hover and press on controls.

- **Product:** P5 the owner uses reduced motion and will see none of it. **P5 dissents** to any new motion. Settled:
  the maintainer asked for it, for the people who keep animations on; the setting's "Do not reduce" lets the maintainer
  review it (Q18); and only the places where motion shows where something went are chosen.
- **Experience:** E1 (1) opening a tool call pushes everything below it down; a short opening shows what moved and where
  the content came from. Only when the person opens or closes one: a transcript view change opens or closes dozens at
  once (ADR 0051), and a session that opens shows its items as they are.
- **Experience:** E1 (3) pinning, archiving, a new session and a session moved up by use (plan section 6.11's order)
  move rows the person is not looking at. The move shows where the session went.
- **Reliability:** (2) **R4 dissents**: animating a panel's width changes the session view's width on every frame, so
  every visible turn wraps again and the transcript's virtualizer measures turn after turn, frame after frame, against
  plan section 11's 60 fps with 10,000 messages. A4 react-resizable-panels sets the sizes itself, from `collapse()`,
  `expand()` and a drag, so an animation would fight a drag. E1 a panel at the window's edge is seen to appear anyway.
- **Product:** (4) P1 calm: a page that cross-fades is a page that answers later. (5) ADR 0049 already chose steady text
  over fades. (6) ADR 0022 stands.

**Verdict: (1) and (3).** Changed from the interview: the inspector and the sidebar keep appearing at once.

### Q8. Keeping the drift out

- **Reliability:** R1 a browser test opens each overlay (dialog, confirm dialog, menu, popover, tooltip) and checks its
  computed `animation-duration` against the tokens, and that it is under 1 ms with reduce, as `Toaster.test.tsx`
  already does for notices.
- **Delivery:** D5 a source check fails on `transition-*`, `duration-*`, `ease-*` and `animate-*` classes in `src`,
  except in the overlay components and for `animate-spin`. ADR 0022's "review every copied component" becomes a check
  instead of a memory. **R1 dissents**: it tests text, not behavior. Settled: it is the cheapest net for the next shadcn
  copy, and the behavior tests stay.
- **Architecture:** A4 a Motion `transition` written outside `lib/motion.ts` fails the same check (Q10).

**Verdict:** both, landed with the drift.

## Round 2: Motion

### Q9. Which tool moves what

Options: **(a)** Motion for everything, overlays included; **(b)** CSS where an element's open or closed state is in the
page (overlays through tw-animate-css, disclosures through `::details-content`), Motion where React adds, removes or
moves an element (the sidebar's rows); **(c)** CSS only, with View Transitions for the rows; **(d)** Motion for rows
and disclosures, CSS for overlays.

- **Product:** P1 the maintainer wants Motion.
- **Architecture:** A4 overlays come from Radix through shadcn and already animate on `data-state` with tw-animate-css.
  Moving them to Motion means `forceMount` and `AnimatePresence` in every copy, each one further from upstream (D5),
  and the reduce rule already covers them. A4 a row that moves or leaves is a change React makes between two renders,
  and CSS sees only the end. Motion's `layout` and `AnimatePresence` measure before and after and move the row between.
  (c) needs a `view-transition-name` on every row and every change wrapped in `startViewTransition`, and draws the
  window as a snapshot while it runs.
- **Experience:** E3 a native `<details>` keeps its role, state and keys in NVDA and Narrator; `::details-content`
  animates it without replacing it. (d) replaces it with a button and a region.
- **Reliability:** R1 two tools mean two switches for reduced motion. Settled by Q11: both follow the same value, and
  one test (Q17) checks both.
- **Delivery:** **D5 dissents**: Motion is four new packages for one list, and released three times in eleven days.
  Settled: the maintainer asked for it; it does the one thing CSS cannot do here; ADR 0020's two-day wait applies to
  it; and any later motion where React adds, removes or moves an element goes through it too.

**Verdict: (b).** CSS animates an element whose open or closed state is in the page; Motion animates an element that
React adds, removes or moves.

| # | Question | Verdict and why |
|---|---|---|
| 10 | One pace for both | A4: the durations and curves of Q3 and Q4 are tokens in `tokens.css`. `lib/motion.ts` gives Motion the same values, in seconds and as four-number curves, and a browser test reads the computed CSS variables and compares them, as the bindings' contract test does for defaults. A Motion `transition` is written only in `lib/motion.ts`. |
| 11 | Motion under reduced motion | A4: one `MotionConfig` at the root, its `skipAnimations` set from the same value `paintMotion` writes (`AppearanceFromSettings`). Never `reducedMotion`, which keeps fades (the research). R3: no imperative `animate()` outside that config. E3: a row on its way out is `inert` from its first frame and the focus moves on at once (plan section 6.11), so neither the keyboard nor a screen reader lands on it. |
| 12 | Loading and the version | D5: `motion` in the pnpm catalog, the newest release at least two days old (ADR 0020), kept fresh by Renovate. `LazyMotion` with `domMax` (layout animations need it), loaded at start, `strict`, so a full `motion` component fails. R4: about 33 kB; plan section 11 sets no bundle limit, and the cold start is measured in CI. |
| 13 | Disclosures | E1: a disclosure opens to its content's height at the opening pace and closes at the closing pace, only when the person opens or closes it, by pointer or keyboard. A transcript view change, Verbose and a session that opens show items as they are. R4: the session view's virtualizer measures the one growing item each frame, and ADR 0049's following keeps the end in view if the person is there. A4: the reduce rule in `base.css` adds `::details-content`. |
| 14 | Rows | E1: a row moves when its session is pinned or unpinned, archived or unarchived, deleted, created, or moved up by use, and when its project is removed. It moves at the opening pace and curve; a row that leaves fades at the closing pace. Search results (ADR 0040) and the first draw show at once. |

## Round 3: documents, tests and tickets

| # | Question | Verdict and why |
|---|---|---|
| 15 | An ADR | Hard to reverse (a dependency, and motion outside overlays), surprising (why two tools; why spinners turn under reduce), and a real trade-off: **ADR 0054**. It changes the motion lines of 0010, 0022 and 0032 and the reduce rule of 0023, and adds Motion to 0006's stack. "No transitions on controls" stands. |
| 16 | The documents | D1, D2: the research, this record, ADR 0054, the glossary (Overlay, Notice), the plan (sections 5.3, 7.4 and 10) and the ADR index: one commit and one pull request, merged first. |
| 17 | Tests | R1, in the browser test bed: each overlay's durations (Q8); the tokens against `lib/motion.ts` (Q10); a disclosure that moves on a click and not on a transcript view change; a row that moves when pinned. Under reduce, after an overlay opens, a disclosure toggles and a row moves, `document.getAnimations()` holds only spinners and every row is in place in the same frame. The source check (Q8). Any changed end-to-end or screenshot test runs 10 times before the merge (CLAUDE.md). |
| 18 | Review with reduce on | P1: the maintainer reviews with Settings → Appearance → Reduce motion → "Do not reduce", which wins over Windows (ADR 0023), and compares a menu and a dialog with Windows 11's own. Each pull request lists what to try. |
| 19 | Branches and tickets | D1: one spec on the tracker with five tickets and blocking edges: (1) overlays at the tokens' pace, the drift and the guard (Q2, Q3, Q8), in its own pull request; then, on one branch and pull request, a commit and an issue each: (2) how overlays move (Q4); (3) spinners under reduce (Q6); (4) disclosures (Q13); (5) Motion and the sidebar's rows (Q9 to Q12, Q14). Tickets 2 to 5 are blocked by 1. |

## Round 4: what building it showed

Two verdicts met the browser and changed in their means, not their outcome; ADR 0054 says how.

| # | Question | Verdict and why |
|---|---|---|
| 20 | Moving a disclosure only on the person's toggle (Q13) | R1: a rule given to `::details-content` in the same click that opens it moves nothing, because the browser animates it only from a state it has drawn. A4: the move is on from the start, and `useDisclosure` holds it still for a change made in code, so a transcript view change still shows items as they are. |
| 21 | Motion under reduced motion (Q11) | R1: `skipAnimations` alone left a moved row sliding, because Motion makes a layout animation instant only through `reducedMotion`. **A4 dissents** from Q11's "never `reducedMotion`": it was turned down for keeping fades. Settled: it is set together with `skipAnimations`, which stops the fades, both from the app's value, and `"never"` while motion is on, so Windows still cannot overrule the setting. |
