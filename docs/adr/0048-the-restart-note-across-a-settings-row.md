# 0048. The restart note across a setting's row

- Status: Accepted
- Date: 2026-10-11
- Changes how a setting that takes a restart says so, from [0031](0031-restarts-and-reset.md) and the settings rows of
  [0032](0032-the-redesign.md).

## Context

Smooth scrolling and Hardware acceleration only change when Arden Code starts again. Once changed, their row said
"Restart Arden Code to apply this." with a Restart now button, under the switch at the end of the row. The maintainer
asked for a better layout (#130): the note and its button made the control's column wide, so the switch and the note
did not line up, and the row read as cluttered.

## Decision

- **The switch stays where every other control is,** at the end of the row.
- **The note is a quiet strip across the foot of the row,** under both the setting's text and its switch: a restart
  icon and the words at its start, Restart now at its end. It shows while the setting differs from what Arden Code
  started with, as before.
- **A setting row has a place for such a note,** so the next setting that takes a restart says so the same way.

## Consequences

- A changed restart setting's row grows by one line instead of widening its control.
- In a Windows contrast theme the strip has a border, since its fill is not drawn.
