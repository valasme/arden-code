# 0022. High contrast and component adjustments

- Status: Accepted
- Date: 2026-09-29

## Context

Building the visual foundation (ticket 6) tested [0010](0010-visual-design-system.md) against real
rendering, in light, dark and Windows high contrast, and found gaps:

- shadcn's Lyra destructive button (red text on a 10% red tint) reaches only 3.99:1 in light mode, below WCAG AA. Any tint breaks it: red text on white is 4.76:1.
- In a Windows contrast theme, text on a `Highlight` or `ButtonText` fill gets a backplate from the browser and becomes unreadable.
- Lyra's `transition-all` animates the focus outline in, which breaks "no animation" for focus.
- Lyra's link variant colors text with `--primary`, which is the same as the button background in a contrast theme, so the text disappears.

## Decision

- **Destructive button:** outlined red at rest (`--destructive` text and border on `--background`), and a solid `--destructive` fill with `--background` text on hover. Both pairs pass 4.5:1 in both themes, and `tokens.test.ts` checks them.
- **Link button:** `--foreground` text, underlined at rest, so a link is recognizable without color.
- **No transitions on controls.** Motion stays limited to overlays (plan section 7.4). Focus is an unlayered `:focus-visible` rule (1px outline, 1px offset, no shadow) that wins over component utilities.
- **High contrast:** fills stay `Canvas` or `ButtonFace`. Selected items (`aria-pressed`, `aria-selected`, `aria-current`, `aria-checked`) are underlined instead of filled. Focus uses `Highlight` for the outline.
- **Design system page** lives in `src/dev`, is reachable only in development builds, and is excluded from the hard-coded-text check because it never ships.
- **Screenshot baselines** are Windows-only (`*-win32.png`) and are produced with `pnpm test:visual:update`.

## Consequences

- Every future component copied from shadcn needs the same review: transitions removed, and no reliance on a filled `Highlight` background.
- Screenshot baselines must be regenerated when the theme or the design system page changes, and the diff reviewed by eye.
