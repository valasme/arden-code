# 0015. Accessibility bar

- Status: Accepted
- Date: 2026-09-29

## Context

Accessibility is a core requirement, but the maintainer wants focus indicators to stay subtle.

## Decision

WCAG 2.2 AA is a release gate. It covers:

- **Keyboard:** everything is reachable, and F6 moves between areas.
- **Focus:** visible but quiet (a 1px outline, keyboard focus only).
- **Screen readers:** tested with NVDA and Narrator. Streaming content is announced politely and throttled.
- **Windows settings:** contrast themes (forced colors), reduced motion, and the text-size setting are honored.
- **Zoom:** 80–200%.
- **Pointer targets:** at least 24×24 px.
- **Contrast:** 4.5:1 for text and 3:1 for controls and focus.
- **Checks:** axe in automated tests, plus a manual checklist before each release.

## Consequences

- Every component needs an accessibility review.
- The theme needed token corrections (see [0010](0010-visual-design-system.md)).
