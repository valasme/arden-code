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
