# 0037. The window buttons keep the arrow

- Status: Accepted
- Date: 2026-10-03
- Changes the pointer rule of [0032](0032-the-redesign.md), and plan sections 6.1 and 7.4.

## Context

The redesign gave the pointer to every enabled control, the window buttons included (ADR 0032). Two things came out of
using it:

- The three window buttons did not agree. Minimize and Close showed the pointer. Maximize showed the arrow, because the
  native overlay that brings Snap Layouts (ADR 0009) sits over it, and its window class uses Windows' arrow.
- Windows' own caption buttons show the arrow, and the maintainer asked for the window buttons to lose the pointer.

## Decision

- **Minimize, Maximize or Restore, and Close show the arrow**, as in Windows.
- **Every other enabled control keeps the pointer**, the title bar's own included: the Window menu, Back and Forward,
  the field that opens the command palette, and the layout controls.

## Consequences

- The window buttons agree with each other and with Windows, in the app's title bar and under the Snap Layouts overlay.
- The title bar test checks the arrow on the window buttons and the pointer on the bar's other buttons.
