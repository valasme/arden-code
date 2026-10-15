# 0056. The stock theme and a lighter accessibility bar

- Status: Accepted
- Date: 2026-10-15
- Supersedes [0015](0015-accessibility-bar.md). Changes the token corrections and the radius of
  [0010](0010-visual-design-system.md), the component adjustments and high contrast of
  [0022](0022-high-contrast-and-component-adjustments.md), the screen reader announcements of
  [0027](0027-long-sessions-and-announcements.md), and axe in [0019](0019-testing-and-quality-gates.md); changes plan
  sections 1, 7 and 10.

## Context

The maintainer asked for a full rewrite of the UI and of accessibility: "Accessibility is TOO much, it gets in the
way, always. And the UI needs a refreshment." They supplied a theme, shadcn's stock "neutral" with a 0.45rem radius,
and asked for it to be weighed rather than taken as given.

The theme in the app was that same stock theme, bent by the WCAG 2.2 AA bar of ADR 0015:

- Five tokens darkened (`--muted-foreground`, `--input` in both themes, `--ring`, `--sidebar-ring`) and the dark
  sidebar's blue taken out, so every pair passed a contrast test.
- A radius of 0, and the Lyra style's square corners.
- A destructive button outlined at rest and a link button underlined, because shadcn's own did not reach 4.5:1.
- Rules for Windows contrast themes in eleven files, and a third screenshot baseline for each screenshot.
- axe in 43 test files, a contrast test over every token pair, a manual checklist with NVDA, Narrator and four contrast
  themes before each release, and a reply announcer that reads a reply to a screen reader in sentences.

Each new component or color had to clear all of it. Most of the cost was in the checks, not in what the person sees.

## Decision

- **The theme is the maintainer's, unchanged.** Every color in `tokens.css` is the supplied one, the dark sidebar's
  blue included. The radius is 0.45rem: `sm`, `md`, `lg` and `xl` are the radius less 4px, less 2px, itself and plus
  4px, as in shadcn. The brand tokens, the selection tint and the motion tokens stay.
- **The components take the stock shapes.** Corners are rounded from the radius tokens. The destructive button is
  shadcn's red tint, and the link button is underlined on hover only.
- **Accessibility is no longer a release gate.** What stays is what the product promises or the maintainer uses:
  - everything works by keyboard, and F6 moves between areas (the cockpit is keyboard-first);
  - keyboard focus shows a quiet 1px outline in `--ring`, never on a mouse click;
  - reduced motion and zoom, which are settings;
  - the semantics Radix gives each control, and a name on every icon-only button, which the tests find controls by.
- **What goes:**
  - the contrast corrections and the contrast test of every token pair (`tokens.test.ts`'s pairs, `lib/contrast.ts`);
  - axe, in the component and the end-to-end tests, and the jsx-a11y lint rules;
  - the rules for Windows contrast themes, and the high contrast screenshots: the web engine's own forced colors
    still apply;
  - the reply announcer: a reply is no longer read to a screen reader as it streams;
  - the manual accessibility checklist, and the 24×24 px minimum pointer target.

## Consequences

- A new color or component is judged by eye, in light and dark.
- Some text pairs fall below 4.5:1 (`--muted-foreground` on `--muted` is 4.34:1 in light), and control borders and
  the focus outline are lighter than 3:1 in light.
- A person who uses a screen reader or a Windows contrast theme gets less than before; the app makes no promise to
  them.
- If accessibility comes back as a goal, it comes back with a new ADR, and the screenshots gain their third theme
  again.
