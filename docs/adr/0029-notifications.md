# 0029. Notifications

- Status: Accepted
- Date: 2026-09-30

## Context

Plan sections 4 and 6.3 ask for Windows notifications that a person can turn off, ready for the events real agents will have (a question, a finished task).

## Decision

- **One rule, one place.** Every notification goes through `notifications::send`, which shows nothing when `notifications.desktop` is off. The rule lives in Rust, next to the sending, so the UI cannot forget it and a later feature cannot bypass it. The setting is on by default.
- **The official notification plugin** shows the toast. With the app installed, Windows takes the name and the icon from the app's identity (`io.github.valasme.arden`) and the Start menu shortcut the installer makes (ticket 25). In development the toast carries the name of the shell that started the app instead, so this part can only be seen in an installed build.
- **The test notification** (Settings → Notifications → Send a test notification) answers whether one was shown. With notifications off it shows none and says so.
- **Tests can see what was sent.** In a debug build, `ARDEN_CODE_NOTIFICATIONS_FILE` makes the app append each notification to a file instead of showing it. The end-to-end tests use it to check that one was sent with the app's name, and that none is sent with notifications off, also after a restart. Release builds have no such variable.

## Consequences

- Nothing in the foundation sends a notification on its own; the test button is the only sender. Agent events will call `notifications::send` when they exist.
- Windows' own Focus assist and per-app switches can still hide a notification. The error code ARD-APP-005 covers Windows refusing to show one.
