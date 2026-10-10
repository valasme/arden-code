# Arden Code: plan

**Status:** accepted · **Date:** 2026-10-03 · **Owner:** [@valasme](https://github.com/valasme)

This is the single source of truth for the app foundation. The reasoning behind each decision lives in
[the decision records](adr/README.md). To change the plan, add or supersede a decision record, then update this file.

## Contents

1. [What we're building](#1-what-were-building)
2. [Identity](#2-identity)
3. [Principles](#3-principles)
4. [Platform and distribution](#4-platform-and-distribution)
5. [Architecture](#5-architecture)
6. [User experience](#6-user-experience)
7. [Visual design](#7-visual-design)
8. [Brand](#8-brand)
9. [Internationalization and input](#9-internationalization-and-input)
10. [Accessibility](#10-accessibility)
11. [Performance targets](#11-performance-targets)
12. [Security](#12-security)
13. [Privacy](#13-privacy)
14. [Diagnostics and error handling](#14-diagnostics-and-error-handling)
15. [Testing and quality gates](#15-testing-and-quality-gates)
16. [Tooling, CI and releases](#16-tooling-ci-and-releases)
17. [Milestones](#17-milestones)
18. [Risks and watch list](#18-risks-and-watch-list)
19. [References](#19-references)

## 1. What we're building

Arden Code is a Windows 11 desktop app for running and supervising coding agents, Claude Code and Codex,
from one keyboard-first, accessible and private cockpit.

The first build is the **foundation**:
- the window shell and settings
- the keyboard and command system
- diagnostics and accessibility
- internationalization and updater plumbing
- brand assets
- a placeholder session view driven by a built-in **Demo agent**

All of it is production-grade, so real features plug into it later.

**Out of scope for the foundation:**
- Real agent sessions. Claude followed the foundation as the first real agent (§5.8, §6.12); Codex is still to come.
- Tray icon and background mode.
- App links and Explorer integration.
- Agent-specific colors.
- Languages other than English.
- Telemetry.
- macOS, Linux, Windows 10 and ARM64.

## 2. Identity

| | |
|---|---|
| Product name | Arden Code |
| Tagline | A Windows cockpit for Claude Code and Codex |
| Repository | [github.com/valasme/arden-code](https://github.com/valasme/arden-code), public |
| App identifier | `io.github.valasme.arden`. **Permanent, never change it:** it keys the data folders, notifications and updates |
| Executable | `arden-code.exe`. The window title and Task Manager show "Arden Code" |
| Terminal command | `arden-code`, a console launcher the installer adds to the user PATH ([ADR 0021](adr/0021-terminal-command.md)) |
| Settings file | `%APPDATA%\io.github.valasme.arden\settings.json` |
| Logs, crash reports, cache | `%LOCALAPPDATA%\io.github.valasme.arden\` |
| Internal names | Rust crates `arden-*`, private JS workspace packages `@arden/*` |
| Version | SemVer from `0.1.0`, kept in one place and bumped by release-please |
| License | MIT, brand assets included. Bundled fonts keep the SIL Open Font License 1.1 |

## 3. Principles

1. **Private by default.** No telemetry. The only automatic network request is the update check to GitHub.
2. **Hands off credentials.** Vendor CLIs handle sign-in. Arden Code never reads, stores or forwards tokens.
3. **Native to Windows 11.** Snap Layouts, Windows keyboard conventions, regional formats, contrast themes and text scaling.
4. **Keyboard-first and accessible.** WCAG 2.2 AA. Focus is always visible, never loud.
5. **Calm.** A neutral palette, zero corner radius, no flashy effects. The brand color appears only in brand moments.
6. **Fail safe.** Broken state falls back to defaults and keeps a backup. Every error has a code that also appears in the logs.
7. **Typed end to end.** Rust types generate the TypeScript contract.
8. **Reproducible.** Pinned toolchains, committed lockfiles, and generated files verified in CI.

## 4. Platform and distribution

- **Operating system:** Windows 11 (build 22000 or later), x64 only. The installer politely refuses Windows 10. We test on 24H2 and 25H2.
- **Runtime:** Tauri 2.12 on WebView2 (evergreen, preinstalled on Windows 11). Tauri 3 is in alpha; revisit when it's stable.
- **Installer:** NSIS, per user, so no admin prompt.
  - It adds `arden-code` to the user PATH (a checkbox, on by default).
  - The uninstaller offers "Also delete my settings, sessions and logs".
- **Updates:** `tauri-plugin-updater`, with signed update manifests on GitHub Releases. See §6.7 for the user-facing behavior.
  - The private key that signs updates lives in the maintainer's password manager and in a GitHub Actions secret.
  - **If that key is lost, existing installs can never auto-update again.**
- **Channels:** GitHub Releases and winget. MSI or the Microsoft Store only if there's demand.
- **Code signing:** deferred until the first public release. The release pipeline has a signing step that switches on once its secrets exist. Candidates:
  - Certum Open Source Code Signing (cloud): shows the maintainer's name, roughly €50–70 a year.
  - SignPath Foundation: free, but the publisher shows as "SignPath Foundation".
  - Azure Artifact Signing is not an option: it only accepts individuals in the US and Canada.

## 5. Architecture

### 5.1 Repository layout

```text
arden-code/
├─ apps/
│  └─ desktop/                  @arden/desktop: React + Vite UI
│     ├─ src/
│     │  ├─ app/                providers, router, root layout
│     │  ├─ routes/             TanStack Router file routes
│     │  ├─ features/           sessions, settings, commands, diagnostics, updates, …
│     │  ├─ components/         app components (TitleBar, Sidebar, StatusBar, …)
│     │  ├─ components/ui/      shadcn components (radix-lyra)
│     │  ├─ ipc/                generated bindings.ts + typed helpers
│     │  ├─ i18n/               i18next setup, locales/en-US.json
│     │  ├─ lib/                utilities
│     │  └─ styles/             tokens, fonts, global CSS
│     ├─ public/brand/          generated brand assets
│     └─ src-tauri/             Tauri app crate (binary: arden-code)
├─ crates/
│  ├─ arden-core/               domain types, IDs, AppError and error codes
│  ├─ arden-settings/           schema, defaults, migrations, persistence, file watching
│  ├─ arden-diagnostics/        logging, redaction, crash reports, diagnostics bundle
│  ├─ arden-process/            process supervisor (Job Objects), CLI resolution and detection
│  ├─ arden-agents/             AgentDriver trait + Demo driver
│  ├─ arden-windows/            Win32 integration: Snap Layouts, text scale, regional format
│  └─ arden-cli/                console launcher, installed as bin\arden-code.exe
├─ brand/                       @arden/brand: logo sources, fonts, build script, outputs
├─ docs/                        PLAN.md, adr/, dev-setup.md
├─ .github/                     CI workflows, issue templates, Renovate config
├─ Cargo.toml                   Cargo workspace (single target/ at the root)
├─ package.json                 root scripts, packageManager pin
├─ pnpm-workspace.yaml          workspace packages, catalogs, pnpm settings
└─ rust-toolchain.toml          pinned Rust version
```

A shared `packages/ui` gets split out only once a second consumer, such as a website, exists.

### 5.2 Process model

- **The Rust side owns** settings, logging, diagnostics, child processes, OS integration and updates, and later the agents.
- **The web UI owns** presentation. It talks to Rust only through generated, typed commands, events and channels.
- **There is one main window.** A second launch, or running `arden-code <folder>`, forwards its arguments to the running instance and focuses it.

### 5.3 Frontend stack

Versions are current at the time of writing. Renovate keeps them fresh.

| Concern | Choice |
|---|---|
| UI runtime | React 19.3 with React Compiler 1.0 (`reactCompilerPreset` through `@rolldown/plugin-babel`) |
| Build | Vite 8 (Rolldown) with `@vitejs/plugin-react` 6 |
| Type-checking | TypeScript 7 (native compiler) |
| Routing | TanStack Router 1.x: file-based, automatic code splitting, search params validated with Zod |
| Data from Rust | TanStack Query 5: caches reads; Rust events trigger invalidation |
| UI state | Zustand 5 (sidebar, panels, palette) |
| Forms | TanStack Form 1.x + Zod 4 |
| Components | shadcn/ui CLI 4, Radix base, **Lyra** style; Tailwind CSS 4.3; tw-animate-css |
| Icons and toasts | Lucide; Sonner |
| Shortcuts | TanStack Hotkeys (alpha), wrapped by our command registry so it can be swapped |
| Long lists | shadcn MessageScroller and TanStack Virtual |
| Markdown | Streamdown (safe while streaming) + Shiki; raw HTML disabled |
| Translation | i18next + react-i18next + i18next-cli |
| Fonts | Fontsource, bundled locally: Inter Variable and Cascadia Code Variable |

### 5.4 Rust stack

| Concern | Choice |
|---|---|
| App framework | Tauri 2.12; Rust stable (pinned), edition 2024 |
| Official plugins | single-instance, window-state, updater, process, dialog, opener, os, notification, clipboard-manager |
| Community plugins | tauri-plugin-prevent-default, which disables browser shortcuts and the default context menu in release builds |
| Typed IPC | tauri-specta 2 (release candidate) |
| Errors | thiserror 2; `anyhow` only at the binary's outer edge |
| Logging | tracing, tracing-subscriber, tracing-appender |
| Settings | serde, schemars (JSON Schema), notify (file watching) |
| Windows APIs | the `windows` crate |
| Processes | tokio::process with Windows Job Objects; `which` for PATH/PATHEXT resolution |

### 5.5 The contract between Rust and the UI

- tauri-specta generates `apps/desktop/src/ipc/bindings.ts`, covering commands, events and types. CI regenerates the file and fails if it has drifted.
- Every command returns `Result<T, AppError>`. An `AppError` has a `code` (such as `ARD-SET-002`), a translation key for its message, and optional details.
- Streams, such as the Demo agent's output and live logs, use Tauri channels. State changes broadcast as typed events.

### 5.6 Data and persistence

- **Settings** live in `settings.json`, in the roaming data folder.
- **Sessions**, with their projects and turns, live in `sessions.db`, a SQLite file in the local data folder ([ADR 0035](adr/0035-saving-sessions.md)).
  - The list of sessions is read at start; a session's turns when it is first opened.
  - A session is written when it is made or changed, and a turn when its message is sent and when its reply ends. Nothing is written while a reply streams.
  - A reply cut off by closing the app comes back as failed. Ids are never reused.
  - A file that cannot be read is set aside, and the app starts with no sessions (`ARD-AGT-004`).
- Each project records whether the person trusts it, and each Claude session the id of its conversation in Claude Code ([ADR 0039](adr/0039-working-with-claude.md)).
- Timestamps are stored in UTC and shown in local time.

### 5.7 Domain model

```text
Project   a folder on disk, where agents work
└─ Session   one conversation with one agent (Claude, Codex or Demo): pinned, archived, or linked from another
   └─ Turn   the user's message plus the agent's reply
      └─ Item   text · thinking · tool call · file change · approval request · question · error · status marker
```

The sidebar lists the pinned sessions, then each project's other sessions, the most recently used first (§6.11). The foundation ships one built-in project, the **Playground**: a real folder the app creates for itself on first launch, in `%LOCALAPPDATA%io.github.valasme.ardenplayground`. It holds the sessions that need no folder of the person's, such as Demo agent sessions, so every project, including this one, is a folder on disk.

### 5.8 Agent integration

- **Common interface:** an `AgentDriver` trait with these operations: start or resume a session, send a turn, stream items, answer approval requests, cancel.
- **Demo driver (in the foundation):** streams realistic fake output through the real pipeline.
- **Codex (later):** `codex app-server`, JSON-RPC over stdio. This is the protocol OpenAI's own clients use.
- **Claude** ([ADR 0038](adr/0038-claude-through-its-own-protocol.md), from [the research](research/claude-agent.md) and [the councils](research/claude-agent-councils.md)):
  - Arden Code runs the person's installed `claude` in headless streaming mode (`-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-mode <the session's mode>`) and speaks Claude Code's control protocol itself, in Rust.
  - The session's permission mode is passed at start (Manual as `default`) and changed in a running Claude Code with `set_permission_mode`; its `system/status` frames report every change, which the session follows ([ADR 0044](adr/0044-permission-modes-the-context-window-and-the-agents-icon.md), [the research](research/permission-modes-and-context.md)). `--allow-dangerously-skip-permissions` is passed only while Allow Bypass permissions is on.
  - When a reply ends, `get_context_usage` (`detail: "summary"`) reports how full the session's context window is, with no message to the model.
  - Approval requests and Claude's questions arrive on the same pipes (`--permission-prompt-tool stdio`) and are answered there. Stop sends `interrupt`.
  - One `claude` per session, started by its first message. It ends when the session is archived or deleted, when the app closes, or after 10 minutes with no turn and nothing heard.
  - Arden Code makes each session's conversation id (`--session-id`), and later starts carry it on (`--resume`).
  - Claude Code 2.1.223 or later. npm's `claude.cmd` is followed to the package's own `claude.exe`; untrusted text never reaches a `.cmd`.
  - Its answer to `initialize` and its `commands_changed` frames list the slash commands and the models, with the efforts each takes ([ADR 0042](adr/0042-slash-commands-and-exact-models.md), [the research](research/claude-commands-and-models.md)). The model passed to `--model` is such a value, checked again before it is passed.
  - Its `get_usage` answers and `rate_limit_event` frames report the person's 5-hour and weekly limits ([ADR 0043](adr/0043-usage-limits.md), [the research](research/usage-limits.md)). `get_usage` is experimental, so an error or an unknown shape only hides the figures.
  - Claude Code's error output goes to the child's log; the conversation on its standard output does not.
- **Raw mode (later):** an embedded terminal (ConPTY + xterm.js) running the vendor's own terminal UI.
- **Deliberately not used:**
  - The Agent Client Protocol: it mainly helped with Cursor, which is out of scope.
  - Anthropic's TypeScript Agent SDK: it needs a bundled JavaScript runtime and speaks the same protocol to the same CLI.
  - An MCP permission tool: Claude Code's control protocol carries approvals itself.
  - Community Rust crates for Claude Code: lightly used; Arden Code keeps its own small client.
- **Process supervisor (in the foundation):**
  - Resolves executables through PATH and PATHEXT, preferring real `.exe` files.
  - Never passes untrusted arguments through `.cmd` or `.bat` wrappers, a known class of Windows argument-injection bugs.
  - Runs child processes inside a Windows Job Object, so they close when the app closes.
  - Logs each child process's output to its own file.
- **Detection:** Settings → Agents shows whether `claude` and `codex` are installed, where, and which version; for Claude Code also the minimum version and whether it is signed in. It runs once in the background after start, and again with Look again.
- **Vendor terms:** Anthropic's rules on using subscriptions from other tools changed several times in 2026. Arden Code only ever launches the person's own CLI, which handles the person's own sign-in. [vendors.md](vendors.md) summarizes the current terms, with the date they were checked.

## 6. User experience

### 6.1 Window and layout

```text
┌ Title bar: logo · menu · back/forward · search / command palette · ◧ ◨ ⬓   ─ □ ✕ ┐
├ Sidebar ─────────┬ Main ─────────────────────────────────┬ Inspector (hidden) ─┤
│ New session ^N   │      ┌ reading column, 45rem ┐        │ later: diffs,       │
│ PINNED           │      │ turns                 │        │ files, terminal     │
│ PROJECT          │      │                       │        │                     │
│  sessions        │      │                       │        │                     │
│ Archived         │      │                       │        │                     │
│ Settings    ^,   │      └ message box ──────────┘        │                     │
├──────────────────┴───────────────────────────────────────┴─────────────────────┤
└ Status bar: what the agent is doing · update status · version                    ┘
```

- **Panes:** the sidebar and the inspector can be collapsed and resized. Their sizes are remembered.
- **Layout controls** ([ADR 0033](adr/0033-layout-controls-in-the-title-bar.md)): toggles for the sidebar, the inspector and the status bar sit in the title bar, as in VS Code, so they are on screen whatever is hidden. The status bar only says things.
- **The look** ([ADR 0032](adr/0032-the-redesign.md)): a quiet frame in the spirit of Linear, the session view in the spirit of Claude Desktop. New session is the sidebar's first row and Settings its last, each with its shortcut; each project is a small label over its sessions. Every enabled control shows the pointer cursor, except the window buttons, which keep the arrow as Windows' own do ([ADR 0037](adr/0037-the-window-buttons-keep-the-arrow.md)).
- **No white flash:** the window starts hidden, with its background already in the current theme. It appears after the first frame is drawn.
- **Window memory:** size, position, monitor and maximized state are restored. A position that would now be off-screen is corrected.
- **Smallest size:** 500 × 560 px. Windows asks for 500 px or less, or the window does not fit the zones of Snap Layouts; the sidebar and the session view at their smallest fit in it.

### 6.2 Title bar and Snap Layouts

- **Custom title bar:**
  - drag area, the logo included; double-click to maximize
  - the logo is only the logo; the Window menu button beside it opens the system menu, as Alt+Space and a right click on the drag area do ([ADR 0034](adr/0034-the-logo-and-the-window-menu.md))
  - window buttons with accessible names
  - hover and pressed states that match Windows (Close turns red)
  - the layout controls before the window buttons, kept with the title bar of Windows too
- **Snap Layouts:** Windows 11 shows its layout picker when the pointer rests on Maximize, but only if the window reports that spot as a maximize button (`WM_NCHITTEST` returning `HTMAXBUTTON`).
  - Tauri doesn't support this yet ([tauri#4531](https://github.com/tauri-apps/tauri/issues/4531)).
  - So `arden-windows` places a small native overlay over our Maximize button. We write it ourselves rather than depend on a lightly used plugin.
- **Fallback:** Settings → Advanced → "Use native title bar".
- **No Mica or Acrylic:** the flat, opaque theme is intentional.

### 6.3 Settings

Settings is a full page at `/settings/<tab>`, with search across every setting. Changes apply instantly, with inline validation, and each setting can be reset on its own.

On a settings page the sidebar shows Back, the settings search and the tabs instead of the projects, so there is one sidebar; Back returns to the last page outside Settings. The page scrolls by itself, and the tabs stay put. Each tab is a centered column under its title, with every setting as one row of a list: name and description, then the control at the end of the row. A choice of a few options is a row of joined buttons, and on or off is a square switch.

| Tab | Settings and actions (default in brackets) |
|---|---|
| General | On startup: restore last session [default] or start fresh · Regional format: follow Windows [default] or English (US) · Check for updates automatically [on] |
| Appearance | Theme: system [default], light or dark · Zoom 80–200% [100%] · Follow Windows text size [on] · Code font size 11–20 px [13] · Code ligatures [off] · Reduce motion: follow Windows [default], on or off · Smooth scrolling [on], after a restart · Show status bar [on] |
| Keyboard | Every command with its shortcut · click to record a new shortcut · conflict warnings · reset one or all |
| Notifications | Desktop notifications [on] · Send a test notification |
| Agents | Install status, path and version for Claude Code and Codex, with an install link · for Claude Code, the minimum version, whether it is signed in, and its usage limits with their reset times · Show usage limits [on] · Allow Bypass permissions [off] · Look again |
| Advanced | Log level [info] · View logs · Open logs folder · Export diagnostics · Developer mode [off], which enables F12 dev tools · Use native title bar [off] · Hardware acceleration [on]; turning it off works around GPU glitches and needs a restart · Open `settings.json` · Export or import settings · Reset settings · Reset Arden Code |
| About | Logo, version, build (commit and date), Windows and WebView2 versions · Copy system info · Check for updates · Release notes · Report a bug · Privacy ("Arden Code collects nothing") · MIT license · Open-source licenses · "Not affiliated with Anthropic or OpenAI" |

There is no language picker until a second language exists.

**How settings are stored** (`arden-settings`):
- **Schema:** typed, with defaults. A `settings.schema.json` is generated next to the file so editors can autocomplete it.
- **Versioning:** versioned migrations upgrade old files.
- **Safe writes:** each save writes a temporary file and renames it over the real one. A last-known-good backup is kept.
- **Hand edits:** changes made directly to the file reload live.
- **Invalid file:** it never crashes the app.
  - The defaults load instead.
  - The bad file is kept as `settings.invalid-<timestamp>.json`.
  - A quiet notice appears (`ARD-SET-002`).

### 6.4 Keyboard and commands

A single **command registry** drives the command palette, menus, tooltips, the cheat sheet and the Keyboard settings tab. Each entry has an id, a translated label, an icon, a group (Session, Go to or View), a default shortcut, a rule for when it applies, and a handler.

The command palette is a wide panel high on the screen: a large search line, the commands in their groups with their shortcuts drawn as keys, and the keys that drive it written along the bottom. After the commands, it lists the five sessions used last, and while typing every session whose name or project matches, with matching archived sessions apart ([ADR 0040](adr/0040-finding-sessions-and-removing-projects.md)).

| Action | Default |
|---|---|
| Command palette | Ctrl+K (also Ctrl+Shift+P) |
| New session | Ctrl+N |
| New linked session | Ctrl+Shift+N |
| Open folder | Ctrl+O |
| Rename session | F2 |
| Pin, unpin, archive, unarchive or delete the session | none (menus, command palette) |
| Settings | Ctrl+, |
| Toggle sidebar / inspector | Ctrl+B / Ctrl+J |
| Toggle status bar | none (title bar, command palette) |
| Focus the message box | Ctrl+L |
| Send / new line | Enter / Shift+Enter |
| Stop the reply / close a dialog | Esc |
| Move between areas | F6 / Shift+F6 |
| Back / forward | Alt+← / Alt+→, and the mouse side buttons |
| Zoom in / out / reset | Ctrl+= / Ctrl+− / Ctrl+0 |
| Shortcut cheat sheet | Ctrl+/ |
| Full screen | F11 |
| Dev tools (developer mode only) | F12 |

**Rules:**
- **Matching:** shortcuts match the typed character first. They fall back to the physical key position only when a non-Latin keyboard layout is active.
- **No Ctrl+Alt+letter:** on Windows that combination is AltGr, which types characters on many keyboard layouts.
- **Windows keys stay untouched:** Alt+F4, Alt+Space and Win+… keep their Windows meaning.
- **Context menus** open with Shift+F10 and the Menu key, as well as right-click.

### 6.5 Session view placeholder and the Demo agent

- **Layout:** the turns sit in a centered reading column, at most 45rem wide. The person's message is a filled block at the end of the line; the reply follows under the agent's name with no box. Tool calls, file changes and thinking are quiet lines along a rule, and turns are separated by space.
- **Message box:**
  - A bordered block, at least two lines tall, with the agent and the project under the text, and Send. While the session is empty they are menus (§6.12). While a reply runs, Send becomes Stop.
  - Enter sends; Shift+Enter adds a line.
  - Enter never sends while a character is still being composed (accent keys, input methods for other scripts).
  - Spellcheck is on.
- **Demo agent:** clearly labeled as a demo.
  - It streams markdown, code blocks, thinking, tool-call cards, file-change cards and errors.
  - Everything goes through the real pipeline: Rust driver → channel → store → virtualized list → Streamdown.
- **What it proves:**
  - Scroll anchoring and "jump to latest" work.
  - Esc stops a reply.
  - 10,000 messages still scroll at 60 fps.
  - Screen-reader announcements are polite and throttled.
  - Error and empty states look right.
- **Components:** our own, on TanStack Virtual (ADR 0027), with Streamdown for the reply's markdown.

### 6.6 First launch

There is no setup wizard. The session view shows the welcome state:
- the mark and a question naming the chosen agent: "What should Claude work on?"
- the message box, with the agent and project menus: sending from it starts a session and sends the message. The agent is Claude when Claude Code is installed, else the Demo agent (§6.12)
- three shortcut hints under it: Ctrl+K, Ctrl+N and Ctrl+,

The theme follows Windows.

### 6.7 Updates

- **Checking:** 10 seconds after launch, then every 6 hours.
- **Downloading:** quietly in the background.
- **Installing:** the status bar shows "Update ready: restart". The update installs on the next restart, or immediately when that notice is clicked.
- **Never interrupts.** Automatic checks can be turned off in General.
- **Channel:** stable only for now.

### 6.8 Errors, empty states and recovery

- **Error messages** say what happened, why, and what to do. They show a code such as `ARD-SET-002`, which also appears in the logs.
- **Code format:** `ARD-<AREA>-<NNN>`. Areas: `APP`, `SET`, `IPC`, `LOG`, `PROC`, `AGT`, `UPD`, `WIN`, `FS`.
- **Page error screens** offer Copy details, Reload and Open logs.
- **Crashes** leave a report. On the next start, a dialog offers to export diagnostics.
- **Web engine failure:** if the WebView2 process fails, the UI reloads and shows a notice.
- **Reset Arden Code** (in Advanced) wipes settings, sessions, logs and caches after a confirmation. The uninstaller offers the same. A reset that another program stops keeps the settings, says so, and finishes at the next start (ADR 0031).

### 6.9 Quality-of-life details

- **Menus:** custom context menus. The browser's default menu is disabled in release builds.
- **Links:** they open in the default browser. Unusual link types ask first.
- **Code blocks:** each has a Copy button.
- **Memory:** the last settings tab and pane sizes are remembered.
- **Tooltips:** they show the shortcut.

### 6.10 Design system page (development builds only)

A hidden page shows every design token, the type scale, colors, each component in every state, icons and brand assets. It has theme, contrast and zoom toggles.

It replaces a Figma library, stays in sync with the code, and is the target for screenshot (visual regression) tests.

### 6.11 Managing sessions

The decisions and the options turned down are in [ADR 0036](adr/0036-managing-sessions.md).

- **One menu per session:** from the "…" button at the end of its row in the sidebar, a right click, Shift+F10 or the Menu key on the row, and the "…" button in the open session's header. Each action is also a command for the open session.
- **Rename** opens a small dialog (F2). A name has 1 to 100 characters, and a renamed session keeps its name after its first message.
- **Pin** keeps a session under Pinned at the top of the sidebar, across projects, in the order it was pinned.
- **Archive** puts a session away: off the sidebar's lists, listed on the Archived sessions page, and read-only until it is unarchived. A notice offers Undo.
- **Delete** removes a session for good, after a confirmation. For a Claude session, the confirmation says that Claude Code keeps its own copy of the conversation.
- **New linked session** (Ctrl+Shift+N) starts an empty session in the same project, with the same agent, linked to the open one. Each shows the link to the other.
- **Order:** each project's sessions with the most recently used first. A folder project with no sessions in its list is not shown; the Playground always is.
- **Remove project** (a folder project's … button or right click) deletes the project and all its sessions, archived ones too, after a confirmation that says how many. The folder on disk stays; the Playground cannot be removed ([ADR 0040](adr/0040-finding-sessions-and-removing-projects.md)).
- **On startup,** "Restore the last session" opens the session that was opened last, unless it was archived or deleted. A folder opened from the terminal wins.
- **Focus:** when a row leaves a list, the focus moves to the next row, else the previous one, else New session.

### 6.12 Working with Claude

The decisions and the options turned down are in [ADR 0039](adr/0039-working-with-claude.md).

- **Starting a session:** while a session is empty, the message box's lower line holds an agent menu and a project menu; the project menu ends with Open folder. New session (Ctrl+N) starts in the open session's project, or the Playground, with the agent of that project's latest session, else of the latest session anywhere, else Claude when Claude Code is installed, else the Demo agent. Open folder (Ctrl+O) adds a folder as a project and starts a session in it. Claude may work in the Playground.
- **Choosing ([ADR 0041](adr/0041-choosing-how-a-session-starts.md), [ADR 0042](adr/0042-slash-commands-and-exact-models.md), [ADR 0044](adr/0044-permission-modes-the-context-window-and-the-agents-icon.md)):** the agent, project, model, effort and permission mode are outlined menus in the message box, on the welcome screen too, where the project starts as the latest session's. Each has an icon that says what it chooses, at 16 px and the label's color. Model, effort and permission mode are for Claude only, can change between messages, and are inherited by new and linked sessions. The lower line holds only what the next message can change, then the figures and Send, and wraps when narrow; once a session has its first message, its agent (with the agent's icon) and its project show in the header, by its title.
  - **Model:** Default (Claude Code's own setting), or any model Claude Code lists: the families first (Opus, Sonnet, Fable, Haiku), then the older versions under "Older models", by full id. A saved model Claude Code no longer lists is kept, shown as it is and marked. Until Claude Code has listed its models, the four families.
  - **Effort:** Default, or the efforts the chosen model takes, Low to Max; a model with none shows only Default and the Ultrathink switch.
  - **Ultrathink:** a switch at the end of the effort menu. The next message gets the word `ultrathink` at its end, once; Claude Code reasons more deeply on that turn only. While the next message will carry the word, switched on or typed, an Ultrathink chip shows in the lower line; with the switch on, it can turn it off.
  - **Permission mode:** Manual, Accept edits, Plan, Auto or Bypass permissions, each with a line saying what it does. It can change at any time, during a reply too, and the session follows what Claude Code reports. A new session never inherits Bypass permissions, which can be chosen only while Allow Bypass permissions (Settings → Agents) is on; then the menu's button takes the destructive color. Next permission mode (Ctrl+Shift+M) moves to the next one, and the digits choose in the open menu.
  - **Plan mode's end:** when Claude asks to leave Plan mode, a plan card shows the plan as Markdown, with Start, accepting edits; Start, asking first; and Keep planning, which sends the person's words back.
- **Slash commands (ADR 0042):** a message of a Claude session that starts with `/` lists the slash commands Claude Code reports (its own, plugins', skills' and MCP prompts'), filtered as Claude Code's menu filters, with arrow keys, Tab (fill in), Enter (send a command with no arguments, else fill in) and Esc (close). The list comes from Claude Code's answer to `initialize` and its `commands_changed` frames; one Claude Code started in the Playground per start of Arden Code, with no message, hears them before a session has one. `/model`, `/effort`, `/rename` and `/clear` (also `/reset`, `/new`) are run by Arden Code, since they change what it holds; everything else is sent as typed.
- **Trust:** before Claude first runs in a project, the person is asked once whether they trust it, because Claude Code then runs the project's own hooks, MCP servers and environment. Cancel keeps the message in the box. The Playground needs no trust.
- **What a reply shows:** text and thinking as they stream, tool calls with their results, and file changes with the lines added and removed. A subagent's inner steps are not shown; its tool call is.
- **Approval requests:** a card under the tool call says what Claude wants to do and shows the command, the file and its change, or the address. Allow, Always allow (only when Claude Code suggests a rule) and Deny, which stops the reply. Once answered, it folds to a line. Stop, archiving and deleting deny it.
- **Questions:** a card with each question's options (radio buttons, or check boxes when several may be chosen), an Other field, and Send answers. Stop cancels it.
- **While Claude waits:** the request is announced, the status bar says Claude is waiting for an answer, and a notification is sent when the window is not focused.
- **The figures ([ADR 0044](adr/0044-permission-modes-the-context-window-and-the-agents-icon.md)):** one quiet button before Send, in the message box of a Claude session and of the welcome screen, reads "Context 13% · 5-hour 42% · Weekly 18%", each part only when known, and opens a popover with the details.
  - **Context window:** how full the session's context window is, as Claude Code reports it when a reply ends, kept with the session. The popover gives the tokens used of the window, where Claude Code compacts the conversation, and the breakdown. From 80% of that point, the figure is emphasized.
- **Usage limits ([ADR 0043](adr/0043-usage-limits.md)):** the 5-hour and weekly limits Claude Code reports, the same whatever session is open, with their reset times in the popover. From 80%, or Claude Code's warning, a figure is emphasized; at the limit it says when the window resets. Settings → Agents shows both with their reset times. Arden Code asks Claude Code at start, when a Claude reply ends, on Look again, and on focus when the figures are more than 5 minutes old, never more than once a minute. Nothing shows for an API key, a cloud provider or a signed-out Claude Code. Show usage limits [on] turns both the asking and the showing off.
- **When Claude cannot start:** the reply says why, with a code, and what to do: install Claude Code, run `claude update`, or sign in with `claude` and `/login` in a terminal. Arden Code never offers a sign-in of its own.

## 7. Visual design

### 7.1 Theme tokens

This is the maintainer's neutral OKLCH theme. `★` marks an accessibility correction and `＋` a new brand token. The corner radius is 0 everywhere; only the logo is rounded.

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.546 0 0);           /* ★ was 0.556: 4.5:1 on --muted */
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);                     /* decorative: cards, dividers */
  --input: oklch(0.646 0 0);                      /* ★ was 0.922: control borders 3:1 */
  --ring: oklch(0.646 0 0);                       /* ★ was 0.708: focus outline 3:1 */
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.646 0 0);               /* ★ was 0.708 */
  --brand: oklch(0.737 0.126 47.7);               /* ＋ logo orange: graphics only, never text */
  --brand-wordmark: oklch(0.375 0.051 42.9);      /* ＋ logo brown */
  --selection: oklch(0.737 0.126 47.7 / 25%);     /* ＋ warm text-selection tint */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 34%);                    /* ★ was 15%: control borders 3:1 */
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.922 0 0);            /* ★ was the stock blue oklch(0.488 0.243 264.376) */
  --sidebar-primary-foreground: oklch(0.205 0 0); /* ★ was 0.985: needed after the line above (1.2:1 → 14.2:1) */
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
  --brand: oklch(0.737 0.126 47.7);
  --brand-wordmark: oklch(0.937 0.014 57.6);      /* ＋ warm off-white, #F2E8E1 */
  --selection: oklch(0.737 0.126 47.7 / 35%);
}
```

- **Destructive buttons in dark mode** keep shadcn's `bg-destructive/60` treatment, which gives white text 6.5:1.
- **Form controls** (inputs, selects, checkboxes, switches) use `--input`. Cards and dividers use the lighter `--border`.
- **Windows contrast themes** (`forced-colors: active`) switch everything to system colors. Borders and focus outlines stay visible.

### 7.2 Typography

- **UI:** Inter Variable. Fallbacks: Segoe UI Variable, Segoe UI, system-ui.
- **Code:** Cascadia Code Variable, with ligatures off by default. Fallbacks: Cascadia Mono, Consolas, monospace.
- **Brand serif:** Lora appears only inside the outlined logo, so it isn't shipped with the app.
- **Loading:** all fonts are bundled through Fontsource, never loaded from the network. Each character subset loads only when those characters appear on screen.
- **Scale:** 11 / 12 / **13 (the UI default)** / 14 (message text) / 16 / 20 / 24 px. Tables and the status bar use tabular numbers.

### 7.3 Color use

- **The UI stays neutral.**
- **Brand orange appears only** in the logo, the app icon, the welcome state and About, plus a subtle tint on selected text.
- **No agent colors yet.**

### 7.4 Focus, motion and density

- **Focus:** shown for keyboard focus only (`:focus-visible`), as a 1px `--ring` outline with a 1px offset. No glow, no animation. Mouse clicks never show a ring.
- **Motion:** short fades and slides (120–160 ms), for overlays only. All motion stops when Windows "Animation effects" is off or Reduce motion is on. Nothing behind an overlay is blurred; its scrim is a flat tint.
- **Cursor:** every enabled button, link and control shows the pointer, except the window buttons (Minimize, Maximize or Restore, Close), which keep the arrow (ADR 0037).
- **Density:** the Lyra style, tuned toward compact. The minimum pointer target is 24×24 px.

### 7.5 Icons

Lucide icons are 16 px with a 1.5 stroke in the UI, and 20 px in the title bar, at the color of the text beside them. Every icon-only button has an accessible label. The message box's menus use a bot for Claude (a flask for the Demo agent), a folder, a brain, rising bars and a shield for the permission mode; Ultrathink is a lightbulb. No vendor's logo is shown without its written permission ([ADR 0044](adr/0044-permission-modes-the-context-window-and-the-agents-icon.md)).

## 8. Brand

### 8.1 Logo construction

**The mark** is a 3 × 5 checkerboard of rounded cells:

```text
row 0   · ■ ·
row 1   ■ · ■
row 2   · ■ ·
row 3   ■ · ■
row 4   · ■ ·
```

| Parameter | Value (H = cell height) |
|---|---|
| Cell proportions | width : height = 1.6 : 1 |
| Outer corners | radius ≈ 0.28 H |
| Diagonal joins | cells touching at a corner are joined by a curve of radius ≈ 0.2 H |
| Open join | the top-right join, between row 0 and row 1 on the right, stays open; every other join is closed |
| Finish | flat color, no texture |

**The wordmark** is "Arden Code" in **Lora Regular**. Both words use the same ink, letter-spacing is −1%, and the text is converted to outlines.

**Lockups:** horizontal (mark + wordmark), stacked, and mark only. The app icon is the mark alone.

### 8.2 Colors

| Role | Light | Dark |
|---|---|---|
| Mark | `#EA9061` · `oklch(0.737 0.126 47.7)` | same |
| Wordmark | `#58382B` · `oklch(0.375 0.051 42.9)` | `#F2E8E1` · `oklch(0.937 0.014 57.6)` |

The mark is a graphic, not text. It contrasts 2.4:1 against white and 8.2:1 against the dark background. Never use the brand orange for text.

### 8.3 Asset pipeline

`pnpm brand:build` (package `@arden/brand`) generates every asset from code. The outputs are committed, and CI fails if they are out of date.

1. **The mark** is generated from the parameters above and merged into a single clean vector shape. A pixel test compares it against the reference image and requires at least 0.95 overlap.
2. **The wordmark:** "Arden Code" set in Lora Regular (OFL) and converted to outlines with opentype.js.
3. **Lockups** are composed in every color variant and saved as SVG masters.
4. **PNGs** are rendered with resvg. At 32 px and below, the grid snaps to whole pixels so small icons stay sharp.
5. **App icons:** `pnpm tauri icon` builds Tauri's icon set from the 1024 px master. The script then replaces `icon.ico` with a hand-tuned multi-size version.
6. **Everything else** comes from the same script: installer images, README headers, the social preview, and the React components.

### 8.4 Asset checklist

- **SVG masters:** mark, horizontal logo, stacked logo and wordmark. Each comes in color-on-light, color-on-dark, black and white.
- **App icons:** Tauri's icon set, plus a hand-tuned `icon.ico` with 16, 20, 24, 32, 40, 48, 64 and 256 px images.
- **Installer images:** NSIS header (150 × 57) and sidebar (164 × 314) bitmaps.
- **Tray icons:** 16–32 px, made now and used later.
- **App components:** `<Logo />`, `<Mark />` and `<Wordmark />`, which follow the theme, plus `favicon.svg`.
- **GitHub:** a README header in light and dark, and a 1280 × 640 social preview.
- **Usage rules:** `brand/README.md` covers clear space, minimum sizes, colors and don'ts.

### 8.5 Affinity library (a sketchbook, not the source of truth)

- **What it is:** an editable Affinity 3.3 document with one artboard per asset, color swatches and a type sample.
- **How it's built:** through Affinity's MCP server. That's enabled in Affinity under Settings → Model Context Protocol, and it listens on `http://[::1]:6767/sse` (IPv6 localhost).
- **Tools used:** `execute_script`, `render_spread` (to check the result visually) and `save_script_to_library`.
- **Saved scripts:** they go to Affinity's Scripts Library with titles starting "Arden Code:" (Window › Scripting › Scripts Library); the library has no categories. Click a script there to run it. The brand library is `brand/assets/affinity/build-brand-library.js`, written by `pnpm brand:build`.
- **File access:** Affinity's MCP can only reach the Desktop, so exports go there first and are then copied into `brand/`.
- **The rule:** changes made in Affinity are carried back into the generator's parameters. The code stays the source of truth.

## 9. Internationalization and input

- **Language:** English (US) only, in `apps/desktop/src/i18n/locales/en-US.json`, bundled with the app.
- **No hard-coded UI text:** every string goes through i18next. `i18next-cli` extracts strings, generates typed keys, and fails CI on hard-coded text.
- **Pseudo-language (development builds only):** accented text about 35% longer than English. It catches cut-off labels and missed strings.
- **Formats:** dates, numbers and relative times use `Intl` with the Windows regional format, which the Rust side reads.
  - Without this, the web engine would format by UI language.
  - Users can override the format in General.
- **Layout:** only direction-neutral CSS (start/end rather than left/right), so right-to-left languages stay cheap to add later.
- **Input:** the message box handles character composition safely. The keyboard-layout rules are in §6.4.

## 10. Accessibility

These are release gates: no release ships unless they all pass.

- **Standard:** WCAG 2.2 AA.
- **Keyboard:** everything works by keyboard, in a logical focus order, and F6 moves between areas.
- **Focus:** visible but quiet (§7.4).
- **Screen readers:** tested with NVDA and Narrator.
  - Every control has a name, role and state.
  - Streaming replies are announced politely and throttled.
- **Windows settings honored:** contrast themes (forced colors), "Animation effects: off", and the text-size setting.
- **Zoom:** 80% to 200% without breaking the layout.
- **Pointer targets:** at least 24×24 px.
- **Contrast:** 4.5:1 for text, and 3:1 for control borders and focus outlines, verified for every token pair.
- **Checks:** axe runs in the unit and end-to-end tests. A manual checklist ([accessibility-checklist.md](accessibility-checklist.md)) runs before each release.

## 11. Performance targets

These are release gates. There are deliberately no installer or bundle size limits.

| Metric | Target |
|---|---|
| Cold start to a usable window | ≤ 1.0 s, with no white frame |
| Warm start | ≤ 0.4 s |
| Idle memory (WebView2 included) | ≤ 200 MB |
| Idle CPU | ≈ 0% (no polling timers) |
| Demo agent streaming | 60 fps with 10,000 messages in a session |
| Applying a settings change | < 50 ms |

Every row is measured by CI on the release build, and the ones that can fail the check are listed in
[performance.md](performance.md).

## 12. Security

- **Content Security Policy:** strict. No remote scripts, styles or fonts; everything is bundled.
- **Least privilege:** each window gets only the Tauri capabilities it needs, and Tauri's isolation pattern validates calls from the UI to Rust.
- **Untrusted output:** agent output is treated as untrusted.
  - Markdown renders without raw HTML.
  - Remote images are blocked by default.
  - Links open in the default browser, and unusual link types need confirmation.
- **Child processes:** started safely (§5.8). Arguments are never built from untrusted strings through shell wrappers.
- **Release builds:** browser shortcuts (reload, print, find) and the default context menu are disabled. Dev tools are available only in developer mode.
- **Secrets:** the foundation stores none. When the app ever does, they go into Windows Credential Manager, never into `settings.json`.
- **Supply chain** (details in §16):
  - pnpm refuses package releases younger than 2 days, and install scripts need explicit approval.
  - `cargo-deny` checks for security advisories and license problems.
  - Renovate waits 2 days before proposing updates.
  - CI builds carry provenance attestations.
- **Reporting vulnerabilities:** through GitHub's private vulnerability reporting. `SECURITY.md` arrives in M0.

## 13. Privacy

- **Nothing is collected:** no telemetry, no analytics, no crash uploads.
- **Automatic network access:** only the update check to GitHub Releases, which exposes your IP address to GitHub. It can be turned off.
- **Everything else is user-initiated**, such as opening a link.
- **Sessions stay on this computer,** in the local data folder. They are never part of a diagnostics bundle.
- **Logs never leave the machine.** "Export diagnostics" creates a local zip, and you decide whether to share it.
- **Redaction:** logs strip the user folder path, tokens and email addresses.
- **Usage limits:** when Arden Code asks Claude Code for the person's usage limits, Claude Code asks Anthropic with its own sign-in. Arden Code reads only the percentages and reset times, keeps them in memory, and never sees a token. Show usage limits turns this off.
- **Context window:** Claude Code answers from its own figures, with no call to Anthropic. Arden Code keeps the token counts and the breakdown's category names with the session, never the names of skills, memory files or tools.
- **Claude Code keeps its own transcripts** in its own folder. Arden Code never reads or changes Claude Code's files, settings or credentials, and Claude Code's standard output (the conversation) is not copied to the logs.

## 14. Diagnostics and error handling

- **Logs:** `tracing` writes JSON lines to `%LOCALAPPDATA%\io.github.valasme.arden\logs\`.
  - One file per day. The last 14 days are kept, capped at 100 MB.
  - Levels: error, warn, info (the default), debug and trace.
  - UI logs are sent to Rust and written to the same files.
- **Log viewer:** in Settings → Advanced, with filters for level, source and text.
- **Export diagnostics:** a zip with recent logs, the redacted `settings.json`, system information (Windows build, WebView2 version, app version, commit and build date), and crash reports.
- **Report a bug:** opens a pre-filled GitHub issue with the system information. It never includes the logs.
- **Error model:**
  - The Rust `AppError` (built with thiserror) carries codes that become TypeScript types through the generated bindings.
  - Each page has an error boundary, plus global handlers for errors and unhandled promise rejections. All of them log the error and show its code.
  - A Rust panic hook writes a crash report.

## 15. Testing and quality gates

| Layer | Tools |
|---|---|
| Rust unit and integration | `cargo test` (see the addendum to ADR 0019) |
| TypeScript unit | Vitest 5 (Node) |
| Components | Vitest browser mode on Chromium (the same engine family as WebView2) + Testing Library + axe |
| UI flows with a mocked backend | The same Vitest browser mode, with the calls to Rust answered by `mockIPC` |
| End to end (the real app) | Playwright attached to the app's WebView2 over CDP (debug builds only). Input that must take the real path goes through Windows instead: key presses for the web engine's own shortcuts, and clicks, with Playwright detached, where timing matters (clicks while CDP is attached hid a bug that real clicks hit) |
| Visual regression | Playwright screenshots of the design system page in light, dark, high contrast and 200% zoom |
| Contracts | Bindings drift check; hard-coded-text lint; brand outputs up to date |

Every change must pass formatting, linting, type-checking and tests. Test coverage is tracked but not enforced.

## 16. Tooling, CI and releases

- **Toolchains:** Node 24 LTS; pnpm 12, pinned through `packageManager`; Rust, pinned through `rust-toolchain.toml`.
- **pnpm settings** (in `pnpm-workspace.yaml`):
  - `minimumReleaseAge: 2880`, meaning package releases must be at least 2 days old.
  - An `allowBuilds` list of packages allowed to run install scripts.
  - Catalogs for shared versions.
- **Linting:** Oxlint in type-aware mode, with rules for TypeScript, React, React hooks, the React Compiler, accessibility (jsx-a11y), imports, unicorn and Vitest.
- **Formatting:** oxfmt, which also sorts Tailwind classes.
- **Other checks:** knip (unused code) and typos (spelling).
- **Rust:** rustfmt, clippy and cargo-deny.
- **Why no ESLint:** typescript-eslint cannot type-check against TypeScript 7 until TypeScript 7.1.
- **Git hooks and commits:**
  - lefthook runs formatting and linting on staged files before each commit.
  - Commit messages follow Conventional Commits, checked by commitlint.
- **CI** (GitHub Actions, Windows x64): format → lint → type-check → unused code → hard-coded UI text → UI tests → screenshot tests → Rust tests → bindings, brand and license checks → build → end-to-end tests on the real app → performance of the release build ([performance.md](performance.md)). A Linux job checks spelling, advisories and licenses. The release trial builds the installer when a file that shapes a release changes.
- **Releases** (built now, switched on later):
  - release-please handles versions and the changelog.
  - tauri-action builds the installer, update signatures and `latest.json`.
  - Build provenance attestations, a winget manifest template, and the optional code-signing step.
- **Dependencies:** Renovate, batched weekly, waiting 2 days after each release.
- **Repository settings:** public; private vulnerability reporting, Dependabot alerts, secret scanning and push protection all on.

## 17. Milestones

The foundation is built in this order. Each milestone ends with green CI and a commit.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Tooling:** workspaces, toolchain pins, Oxlint and oxfmt, TypeScript 7, lefthook, commitlint, CI, Renovate, `SECURITY.md` / `CONTRIBUTING.md` / `PRIVACY.md`, issue templates | An empty app builds and passes CI |
| M1 | **Brand:** the `@arden/brand` pipeline, every asset in §8.4, the pixel test, the Affinity library | `pnpm brand:build` gives identical output on every run, and the Affinity document exists |
| M2 | **Shell:** Tauri 2.12 app with the identifier and per-user installer config, security policy, capabilities, isolation, single instance, window memory, custom title bar with Snap Layouts, no-flash startup, theme and fonts, layout and routing | The window behaves like a native Windows 11 app, and the theme passes the contrast checks |
| M3 | **Rust services:** settings, logging and redaction, error codes, diagnostics bundle, crash handling, process supervisor and CLI detection, notifications, updater wiring, regional format and text scale, the `arden-code` launcher and argument forwarding | Every service has tests, and the bindings are generated |
| M4 | **Settings UI:** all seven tabs, search, instant apply, reset, shortcut rebinding | Every setting in §6.3 works and survives a restart |
| M5 | **Commands:** command registry, palette, default shortcuts, F6 areas, context menus, cheat sheet | Everything is reachable by keyboard |
| M6 | **Session view placeholder:** domain model, Demo agent, streaming pipeline, virtualized list, safe markdown, message box, welcome state | The Demo agent streams at 60 fps with 10,000 messages |
| M7 | **Quality:** design system page, axe checks and screen-reader checklist, Playwright end-to-end tests, performance checks, pseudo-language | Every gate in §10, §11 and §15 is automated or on a checklist |
| M8 | **Release pipeline (switched off):** update-signing keys, release-please, tauri-action, winget template, signing hook, installer PATH option | A dry-run release produces an installer and `latest.json` |

## 18. Risks and watch list

| Risk | Mitigation |
|---|---|
| typescript-eslint can't use TypeScript 7 yet | Oxlint's type-aware rules; revisit with TypeScript 7.1 |
| tauri-specta 2 is still a release candidate | Pin the version; check for binding drift; keep the Rust–UI layer small |
| TanStack Hotkeys (alpha), oxfmt (beta) and Oxlint JS plugins (alpha) aren't at 1.0 | Wrap them behind our own registry; Prettier is the fallback formatter |
| Tauri 3 will bring breaking changes | Stay on 2.x until 3.0 is stable; keep runtime-specific code isolated |
| The Snap Layouts overlay is custom Win32 code | Isolated in `arden-windows`, with a manual test checklist; the native title bar setting is the fallback |
| Anthropic's rules for programmatic use keep changing | Only ever launch the user's own CLI; keep [vendors.md](vendors.md) current; never handle credentials |
| Claude Code's control protocol changes | A minimum version, parsing that ignores what it does not know, recorded frames in the tests |
| Claude Code makes `--bare` the default for `-p` | Opt out in the driver; otherwise the person's sign-in stops working |
| Under `-p`, Claude Code shows no trust dialog | Arden Code asks once per project before Claude runs there (ADR 0039) |
| Unsigned installers trigger SmartScreen warnings | Acceptable during development; sign before the first public release |
| Affinity's MCP is in beta | Affinity is optional; the code pipeline is the source of truth |

## 19. References

- [Tauri 2](https://v2.tauri.app) · [Snap Layouts with custom title bars (tauri#4531)](https://github.com/tauri-apps/tauri/issues/4531)
- [shadcn/ui changelog](https://ui.shadcn.com/docs/changelog): Base UI default, chat components, typeset
- [TanStack](https://tanstack.com) · [Oxc: Oxlint and oxfmt](https://oxc.rs)
- [Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) · [Claude Code headless mode](https://code.claude.com/docs/en/headless) · [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) · [the Claude research](research/claude-agent.md)
- [Playwright with WebView2](https://playwright.dev/docs/webview2)
- [SignPath Foundation terms](https://signpath.org/terms.html)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
