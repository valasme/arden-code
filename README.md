# Arden Code

A Windows cockpit for Claude Code and Codex.

> **Status: pre-alpha, work in progress.** There is nothing to install yet.

## What it will be

Arden Code is a Windows 11 desktop app for running and supervising coding agents
from one place. The goals:

- **Keyboard-first:** a command palette, rebindable shortcuts, and full keyboard navigation.
- **Accessible:** WCAG 2.2 AA, tested with NVDA and Narrator, works with Windows contrast themes.
- **Private:** no telemetry. The only automatic network request is the update check.
- **Hands off your credentials:** Claude Code and Codex sign in through their own CLIs.
  Arden Code never reads, stores or forwards your tokens.
- **Native to Windows 11:** Snap Layouts, regional formats, text scaling, and Windows keyboard conventions.

The first build is the app foundation: the window shell, settings, keyboard system,
diagnostics, accessibility, and a placeholder session view driven by a built-in Demo agent.
Real Claude Code and Codex integration comes after that. See [the plan](docs/PLAN.md).

## Tech

Tauri 2 (Rust) · React 19 · TypeScript 7 · TanStack Router and Query · shadcn/ui (Radix) · Tailwind CSS 4

## Requirements (planned)

- Windows 11, x64
- The Claude Code and/or Codex CLI, installed and signed in

## Development

Setup notes are in [docs/dev-setup.md](docs/dev-setup.md). Build instructions arrive with the first code milestone.

Design decisions are recorded in [docs/adr](docs/adr/README.md).

## License

[MIT](LICENSE) © 2026 Dimitris Valasellis. Bundled fonts keep their own licenses (SIL Open Font License 1.1).

Arden Code is an independent project. It is not affiliated with, endorsed by, or sponsored by
Anthropic or OpenAI. Claude, Claude Code, Codex and OpenAI are trademarks of their respective owners.
