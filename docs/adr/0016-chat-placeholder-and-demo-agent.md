# 0016. Chat placeholder and Demo agent

- Status: Accepted
- Date: 2026-09-29

## Context

The hardest UI in an agent app is the streaming conversation. It has to scroll, stay fast at large
sizes, render untrusted markdown safely, and remain accessible. The foundation has no real agents.

## Decision

- **Demo agent:** a working message box plus a built-in, clearly labeled Demo agent.
  - It streams markdown, code, thinking, tool calls, file changes and errors.
  - Everything goes through the real pipeline: Rust driver → channel → store → virtualized list → Streamdown.
- **Domain model:** Project (a folder) → Session (one agent) → Turn → Item.
- **Storage:** sessions live in memory in a "Playground" project. There is no persistence yet.
- **UI:** shadcn's chat components, styled with shadcn/typeset.

## Consequences

- Performance, accessibility and safety are proven before any vendor integration.
- Chats disappear on restart until SQLite arrives.

## The session pipeline (ticket 19)

- **Rust owns the sessions.** The `arden-agents` crate holds the projects and sessions in a `SessionStore`, behind a Mutex, and defines the `AgentDriver` trait. The Demo driver is its only implementation. The UI never keeps the truth: it reads a session from Rust (`get_session`), so a reloaded page shows the same conversation.
- **A reply is a stream of events.** `send_message` records the person's message as a running turn and returns the session at that moment. The driver runs on its own thread, and every event (`textDelta`, `finished`, `failed`) is first applied to the store and then sent through a Tauri channel. If the channel is closed, the reply stops and the turn is marked failed, so the session is never stuck waiting.
- **The UI applies the same events to its cache.** Events that arrive before the answer to `send_message` wait for it, so the start of a fast reply is never lost. Nothing refetches a session while it streams, because the refetched copy would already contain text the channel is about to deliver again.
- **The Playground** is the folder `playground` in the local data folder, made at startup when it is missing.
- **Time** is stored in UTC (RFC 3339, whole seconds) and shown by the UI in local time, in the regional format.
- **The welcome state** is the home route. Its shortcut hints read the command registry, so they follow the person's own shortcuts.
- **Not built yet:** thinking, tool calls and file changes as items, markdown, stopping a reply with Esc, and long conversations (tickets 20 and 21). The transcript is a plain scrolling list until then.
