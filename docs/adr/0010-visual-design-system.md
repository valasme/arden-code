# 0010. Visual design system

- Status: Accepted
- Date: 2026-09-29

## Context

The maintainer supplied a neutral OKLCH theme (shadcn "neutral", radius 0) and asked for a calm UI,
with focus indicators that don't look flashy. An audit against WCAG AA found failures:

- Light mode: `--ring` 2.6:1, `--input` 1.3:1, and `--muted-foreground` on `--muted` 4.34:1.
- Dark mode: `--input` 1.5:1.
- Dark mode's `--sidebar-primary` was shadcn's stock blue, a leftover from the template.

## Decision

- **Token corrections (light):**
  - `--muted-foreground` → `oklch(0.546 0 0)`
  - `--ring` and `--sidebar-ring` → `oklch(0.646 0 0)`
  - `--input` (form controls only) → `oklch(0.646 0 0)`
- **Token corrections (dark):**
  - `--input` → `oklch(1 0 0 / 34%)`
  - `--sidebar-primary` → `oklch(0.922 0 0)`, with `--sidebar-primary-foreground` → `oklch(0.205 0 0)`
- **New tokens:** `--brand`, `--brand-wordmark` and `--selection`.
- **Color use:** the UI stays neutral. The brand orange appears only in the logo, app icon, welcome state and About, plus a subtle tint on selected text. No agent colors yet.
- **Typography:** Inter Variable (UI) and Cascadia Code Variable (code, ligatures off), bundled through Fontsource. Lora is used only inside the outlined logo.
- **Focus:** keyboard only (`:focus-visible`), a 1px outline with a 1px offset, no glow, no animation.
- **Motion:** 120–160 ms, overlays only, off when reduced motion is on.
- **Density:** Lyra, tuned compact, with minimum pointer targets of 24×24 px.

## Consequences

- Form-control borders look slightly crisper.
- Every token pair passes WCAG AA, and a contrast test keeps it that way.
