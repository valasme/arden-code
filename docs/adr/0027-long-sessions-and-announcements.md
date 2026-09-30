# 0027. Long sessions, stopping a reply, and what screen readers hear

- Status: Accepted
- Date: 2026-09-30

## Context

Plan sections 6.5, 10 and 11 ask for a session that stays fast with thousands of messages, a reply that can be stopped, and streaming text that a screen reader can follow without being flooded.

## Decision

- **Only the visible messages are drawn** (`@tanstack/react-virtual`). The messages are the articles of a `feed`, each with its position and the size of the set, so a screen reader knows where it is in a session it can only partly see. Heights are measured as messages are drawn, and a guess is used until then. A session of 10,000 messages opens in about a second and draws a screenful; scrolling keeps to the frame rate of the screen (measured 17 ms per frame at the 50th and 95th percentile in the browser test).
- **The end stays in view while a reply streams**, as long as the person is within 80 pixels of it. Once they scroll up, nothing moves them, and a "Jump to latest" button appears; it takes them back and makes the view follow again. A session opens at its end.
- **Esc stops a reply** (command `reply.stop`, rebindable like the others). The person's request is recorded in the store, and the driver notices at its next event, so the stop is immediate and needs no help from the driver. The turn ends as `stopped`: a tool that was running stops with it, and a status marker says "You stopped the reply". The session is free for the next message. Esc closes a dialog or a menu first; a plain key that does nothing (Esc with no reply running) is not swallowed.
- **Screen readers hear a reply in whole sentences, not in words.** The text on the screen is not a live region. A separate polite live region is updated with the complete sentences that arrived, at most once every three seconds; half a sentence waits for its end. Markdown marks and the address of a link are not read, an open code block is not read letter by letter, and thinking is never read. When the reply ends, the rest is said with "Reply finished", "Reply stopped" or "Reply failed".
- **The benchmark** (`longSessions.test.tsx`) opens 10,000 messages in a real browser and scrolls through them. Its limits are generous so a slow machine does not fail it, but a version that draws every message would fail by a wide margin. The end-to-end test does the same in the real app. Ticket 27 sets the strict limits on a fixed profile.

## Consequences

- A screen reader user browsing a long session reaches the messages that are drawn; the rest are reached by scrolling.
- The Demo agent's driver needs nothing to support stopping. A real driver also has to end its process when its emit function says to stop.
