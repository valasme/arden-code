# 0049. A reply streams at a steady pace

- Status: Accepted
- Date: 2026-10-11
- Adds to plan section 6.5 and to how the session view follows a reply ([0027](0027-long-sessions-and-announcements.md)).

## Context

The maintainer said a reply looks choppy while the agent writes it (#132). Measured on the real app with a stand-in
streaming as Claude Code does (Claude Code itself was seen to send about 8 characters every 25 ms, very evenly):

- No frame was dropped, even for a reply of 10,000 characters, and Rust passed each piece on at once.
- The text changed on only 63% of frames, 8 characters at a time: each piece was drawn whole as it came, so the words
  popped in in bursts.
- Each new line was first drawn below the view, then pulled up a frame later (by 20 to 234 px). The view followed the
  reply after the virtualizer had measured the turn again and React had drawn once more, after the paint.

Streamdown's own word fade (its `animated` option) was tried and turned down: it draws every word it has already drawn
with no fade, so at Claude's pace each fade was cut short by the next piece, and it does nothing with reduced motion,
which the maintainer uses.

## Decision

- **The text is shown at a steady pace.** What has arrived is shown a little on every frame: a quarter of what is still
  to show, and one character more. At Claude's pace the text runs about three frames behind and changes on every
  frame, a few characters at a time; a burst of 50 characters is caught up in about eight frames. Text that is already
  there when an item is first drawn, as when a session opens, is shown at once.
- **It is not an animation,** so it is the same with reduced motion: nothing moves or fades, the text is only drawn a
  little at a time.
- **The view follows a growing turn in the frame it grows.** Each turn on the screen is watched for its size; when it
  grows while the person is at the end, the view moves to the end after the browser has laid it out and before it
  paints, so a new line is never drawn out of view first.

## Consequences

- The text changes on 93% of frames, about 5 characters at a time, and the end of the reply is in view on every frame.
- A reply's last characters show up to about a tenth of a second after they arrive. Announcements for screen readers
  are made from what has arrived, as before.
