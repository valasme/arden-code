# 0012. Settings service

- Status: Accepted
- Date: 2026-09-29

## Context

Settings are the heart of the foundation. They must be reliable, easy to find, and friendly to
power users.

## Decision

- **Where they live:** `arden-settings` owns a versioned `settings.json` in `%APPDATA%\io.github.valasme.arden\`.
- **Schema:** typed, with defaults. A generated JSON Schema lets editors autocomplete the file.
- **Upgrades:** versioned migrations.
- **Safe writes:** a temporary file is written, then renamed over the original. A last-known-good backup is kept.
- **Hand edits:** edits made outside the app reload live.
- **Invalid file:** the app never crashes on one.
  - It loads defaults and keeps the bad file as `settings.invalid-<timestamp>.json`.
  - It shows a quiet notice with the code `ARD-SET-002`.
- **UI:** a full page at `/settings/<tab>` with search, instant apply, inline validation and per-setting reset.
  - Tabs: General, Appearance, Keyboard, Notifications, Agents, Advanced, About.

## Consequences

- Power users can edit JSON safely.
- Every schema change needs a migration and a test.
