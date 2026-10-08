# Architecture decision records

Each record captures one decision: its context, the choice, and the consequences. Accepted records
are never edited. To change a decision, write a new record that supersedes the old one, then
update [the plan](../PLAN.md).

To add a record, copy [the template](0000-template.md) and give it the next number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-product-identity.md) | Product identity: Arden Code | Accepted |
| [0003](0003-license-privacy-and-vendor-posture.md) | MIT license, zero telemetry, hands off credentials | Accepted |
| [0004](0004-platform-windows-11-x64-tauri-2.md) | Windows 11 x64 on Tauri 2 | Accepted |
| [0005](0005-repository-layout.md) | Light monorepo | Accepted |
| [0006](0006-frontend-stack.md) | Frontend stack | Accepted |
| [0007](0007-typescript-7-oxlint-oxfmt.md) | TypeScript 7 with Oxlint and oxfmt | Accepted |
| [0008](0008-typed-ipc-and-error-codes.md) | Typed IPC and error codes | Accepted |
| [0009](0009-custom-title-bar-and-snap-layouts.md) | Custom title bar with our own Snap Layouts module | Accepted |
| [0010](0010-visual-design-system.md) | Visual design system | Accepted |
| [0011](0011-brand-assets-from-code.md) | Brand assets generated from code | Accepted |
| [0012](0012-settings-service.md) | Settings service | Accepted |
| [0013](0013-logging-diagnostics-crash-handling.md) | Logging, diagnostics and crash handling | Accepted |
| [0014](0014-internationalization-and-input.md) | Internationalization and input | Accepted |
| [0015](0015-accessibility-bar.md) | Accessibility bar | Accepted |
| [0016](0016-chat-placeholder-and-demo-agent.md) | Chat placeholder and Demo agent | Accepted; storage superseded by [0035](0035-saving-sessions.md) |
| [0017](0017-agent-integration-direction.md) | Agent integration direction | Accepted; Claude's approval route superseded by [0038](0038-claude-through-its-own-protocol.md) |
| [0018](0018-distribution-updates-signing.md) | Distribution, updates and code signing | Accepted |
| [0019](0019-testing-and-quality-gates.md) | Testing and quality gates | Accepted |
| [0020](0020-security-and-supply-chain.md) | Security and supply chain | Accepted |
| [0021](0021-terminal-command.md) | The `arden-code` terminal command | Accepted |
| [0022](0022-high-contrast-and-component-adjustments.md) | High contrast and component adjustments | Accepted |
| [0023](0023-zoom-and-the-root-size.md) | Zoom, and the size of one rem | Accepted |
| [0024](0024-areas-context-menus-and-browser-features.md) | Areas, context menus and the browser's own features | Accepted; resetting superseded by [0031](0031-restarts-and-reset.md) |
| [0025](0025-diagnostics.md) | Diagnostics: logs, bundles and crash recovery | Accepted |
| [0026](0026-markdown-links-and-images.md) | Markdown, links and images in an agent's reply | Accepted |
| [0027](0027-long-sessions-and-announcements.md) | Long sessions, stopping a reply, and what screen readers hear | Accepted |
| [0028](0028-process-supervisor.md) | The process supervisor and agent detection | Accepted; logging an agent's protocol changed by [0038](0038-claude-through-its-own-protocol.md) |
| [0029](0029-notifications.md) | Notifications | Accepted |
| [0030](0030-updates.md) | Updates | Accepted |
| [0031](0031-restarts-and-reset.md) | Starting the app again, and resetting it | Accepted |
| [0032](0032-the-redesign.md) | The redesign: a calm frame, and the session in the middle | Accepted |
| [0033](0033-layout-controls-in-the-title-bar.md) | Layout controls in the title bar | Accepted |
| [0034](0034-the-logo-and-the-window-menu.md) | The logo and the window menu, apart | Accepted |
| [0035](0035-saving-sessions.md) | Saving sessions | Accepted |
| [0036](0036-managing-sessions.md) | Managing sessions | Accepted |
| [0037](0037-the-window-buttons-keep-the-arrow.md) | The window buttons keep the arrow | Accepted |
| [0038](0038-claude-through-its-own-protocol.md) | Claude through its own protocol | Accepted |
| [0039](0039-working-with-claude.md) | Working with Claude | Accepted |
| [0040](0040-finding-sessions-and-removing-projects.md) | Finding sessions in the command palette, and removing a project | Accepted |
| [0041](0041-choosing-how-a-session-starts.md) | Choosing how a session starts: agent, project, model and effort | Accepted |
