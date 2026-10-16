# The UI and accessibility: the councils

- Date: 2026-10-16
- Input: the maintainer's request (below), ADRs 0010, 0015, 0019, 0022, 0023, 0027, 0032, 0037, 0039 and 0054, plan
  sections 3, 7 and 10, and the codebase at `e9cf7f6`: pull request #171 as first drafted, which took the supplied
  theme whole and removed every accessibility check.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides, by the same
  25 roles: product (P), experience (E), architecture (A), reliability (R) and delivery (D). Where a role objected, the
  objection is kept with what settled it. The maintainer asked for the council to decide, so each question has a
  verdict. The first draft of #171 was weighed as the first option of each question; the council changed two of its
  choices (Q2 and Q6).

## The request

"Can you do a full rewrite of the UI & Accessibility of this app. Accessibility is TOO much, it gets in the way,
always. And the UI needs a refreshment." The maintainer supplied shadcn's stock neutral theme with a 0.45rem radius,
"but I want council to decide".

The theme in the app was that same stock theme with five tokens darkened for contrast (ADR 0010), the dark sidebar's
blue taken out, and a radius of 0. Every component also carried the rules of ADR 0015 and 0022: axe in 43 test files,
a contrast test over every token pair, rules for Windows contrast themes in eleven files and a third screenshot of each,
the jsx-a11y lint rules, a 24×24 px pointer target, a manual NVDA, Narrator and contrast theme checklist before each
release, and a reply announcer for screen readers.

## Round 1: the theme

### Q1. The contrast corrections

Options: **(a)** the supplied values; **(b)** keep ADR 0010's five corrections.

- **Product:** P1 the maintainer wrote the values out in full, and the complaint is about exactly this: rules bending
  what they asked for. P4 the stock values are what every shadcn app ships; they read as current.
- **Experience:** E2 the corrected `--input` (0.646) draws every field with a hard grey line, the main reason the UI
  looks heavy; at 0.922 a field is a soft edge, and with rounded corners (Q3) it still reads as a field. The
  `--muted-foreground` change (0.556 to 0.546) cannot be seen. **E3 dissents:** a light field border at 1.3:1 and a
  focus ring at 2.6:1 fail WCAG's 3:1. Settled: the focus outline is not the only sign of focus (the caret, and the
  pressed and open states, stay), and the maintainer has set WCAG aside as a target (Q4).
- **Architecture:** A4 one source of values: the theme in `tokens.css` is what the maintainer wrote, so a future copy
  of shadcn's theme lands without a diff to reconcile.
- **Reliability:** R1 the contrast test goes with the corrections; `tokens.test.ts` instead pins the supplied values.
- **Delivery:** D5 one fewer thing to keep in step with shadcn.

**Verdict: (a).**

### Q2. The dark sidebar's blue

Options: **(a)** take the supplied `--sidebar-primary` (`oklch(0.488 0.243 264.376)`) as written; **(b)** keep it
neutral, `oklch(0.922 0 0)` on `oklch(0.205 0 0)`, as ADR 0010 made it.

- **Product:** P1 plan principle 5 and section 7.3: "The UI stays neutral", and the brand orange is the only color
  outside brand moments. P5 the blue is the one value in the supplied theme with a hue that is not the destructive red.
- **Experience:** E2 shadcn's own neutral theme carries the blue in dark mode only, a leftover of its template (ADR
  0010 found the same). Nothing in Arden Code uses `--sidebar-primary` today; the design system page's swatch is the
  only place it shows. But shadcn's sidebar component fills the active item with it, so the first component copied
  from shadcn would put a blue bar in a grey app, in dark mode only.
- **Architecture:** A4 a token nobody reads is still a promise about what the next reader gets.
- **Reliability:** R1 `tokens.test.ts` pins whichever value is chosen.
- **Delivery:** **D5 dissents:** (b) is the one place the theme differs from what the maintainer wrote, and so from
  shadcn's. Settled: it is the one difference, it is named in ADR 0056, and it follows a principle the maintainer
  set and did not change.

**Verdict: (b).** Every other value is the supplied one.

### Q3. The radius

Options: **(a)** 0.45rem with shadcn's scale (`sm` the radius less 4px, `md` less 2px, `lg` itself, `xl` plus 4px);
**(b)** 0.45rem on everything.

- **Experience:** E2 (a): a key cap or a menu row inside a rounded panel needs a smaller radius than the panel, or
  their corners do not nest. E4 the title bar's buttons and the window buttons fill the bar's height and stay square,
  as Windows' own do (ADR 0037); so do bars that span the window (title bar, status bar).
- **Architecture:** A4 the scale is four lines in `theme.css`; components use Tailwind's `rounded-*`.
- **Reliability:** R1 the screenshot baselines are made again, by eye in light and dark.
- **Delivery:** D1 one sweep through the components: every bordered or filled box takes a radius; rows inside menus,
  lists and the command palette are inset so a highlighted row shows its corners.

**Verdict: (a).**

### Q4. The buttons ADR 0022 changed

- **Experience:** E2 shadcn's destructive button (a red tint) and link button (underlined on hover) belong with the
  stock theme. ADR 0022 changed them only to reach 4.5:1. **E3 dissents:** a link button told apart by color at rest.
  Settled: the link button is used for actions beside text, not for links in prose; links in a reply stay underlined
  (`MarkdownText`).

**Verdict:** shadcn's shapes.

## Round 2: accessibility

### Q5. What "gets in the way" means

The council asked what each rule costs and who pays.

| Rule | Who pays | Verdict |
|---|---|---|
| WCAG 2.2 AA as a release gate | every color and component choice, and every release | **Goes.** P1: the complaint. No contrast target. |
| Contrast test of every token pair | every theme change | **Goes** (Q1). |
| axe in component and end-to-end tests | every new component and screen: a failure blocks the pull request | **Goes.** R1: the tests keep finding controls by role and name, which already fails when a control has none. |
| jsx-a11y lint rules | every new component, and six disable comments | **Goes.** E3 dissents: some rules catch real faults. Settled by the line above: an unnamed control fails the tests that look for it. |
| Windows contrast theme rules and screenshots | every component, and a third baseline of every screenshot | **Goes.** E4 dissents: principle 3 named contrast themes. Settled: the web engine's own forced colors still apply, and principle 3 drops the words. |
| 24×24 px pointer target | the compact density | **Goes.** Nothing gets smaller in this change. |
| Manual checklist before each release | every release | **Goes.** |
| Keyboard: everything works, F6 between areas | nothing visible | **Stays.** P1: principle 4, keyboard-first, is the product. |
| Quiet 1px focus outline, keyboard only | nothing: mouse clicks show none | **Stays.** E2 weighed shadcn's 3px halo and turned it down: louder, and the maintainer asked for quiet focus in ADR 0015. |
| Reduced motion, zoom, Windows text size | nothing: they are settings | **Stay.** ADR 0049 records the maintainer uses reduced motion. |
| Radix semantics and names on icon-only buttons | nothing | **Stay.** R1: the tests are written against them. |

### Q6. The reply announcer

Options: **(a)** remove it, as the first draft did; **(b)** keep it.

- **Product:** P1 the complaint is about what gets in the way. The announcer draws nothing, constrains no color or
  component, and blocks no pull request. P5 it is about 140 lines with its own tests, done and stable.
- **Experience:** E3 it is the only way a screen reader user hears a reply while it streams; without it a streaming
  session is silent. Removing it takes something away from a person and gives the maintainer nothing they asked for.
- **Architecture:** A4 it reads the turn and writes one hidden `output`; nothing else depends on it.
- **Reliability:** R4 one timer every three seconds while a reply runs, no cost otherwise.
- **Delivery:** **D5 dissents:** each new kind of item (ADR 0039's requests) needs a line of what it says. Settled: that
  line is written once per kind, in the same component as the item's words.

**Verdict: (b).** The announcer stays, unchanged. It is not a release gate and has no checklist; it is a feature.

## Round 3: documents and delivery

| # | Question | Verdict and why |
|---|---|---|
| 7 | An ADR | Hard to reverse in spirit (a bar removed is rarely put back) and surprising (why the tests no longer run axe): **ADR 0056**, superseding 0015 and the matching parts of 0010, 0019 and 0022. ADR 0027 stands whole (Q6). |
| 8 | The documents | D1: this record, ADR 0056, the plan (sections 1, 3, 7 and 10, 15, 16 and the milestones), the README and the title-bar checklist. |
| 9 | Delivery | The maintainer asked for one pull request: #171, one commit per round of decisions. Every check green on its last commit; the screenshot test run 10 times before the merge (CLAUDE.md). |
