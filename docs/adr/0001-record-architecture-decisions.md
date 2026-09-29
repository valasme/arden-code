# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-09-29

## Context

Arden Code is a solo project that will develop over a long time. Most of its foundation was decided in
a single planning session. Without a written record, the reasons behind those choices would be lost,
and later changes would reopen questions that were already settled.

## Decision

Record every significant decision as a short, numbered record in `docs/adr/`:

- A record is never edited once accepted. A new record supersedes it instead.
- `docs/PLAN.md` always describes the current state and links to the relevant records.

## Consequences

- Each new decision costs a little writing.
- Future changes start from the original reasoning, not from memory.
