# Development setup (Windows 11)

Build and run instructions arrive with milestone M0. This page covers the machine setup,
which only needs doing once.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Windows | 11, x64 | The only supported platform |
| Visual Studio Build Tools | 2026 | Workload: "Desktop development with C++" |
| Rust | pinned in `rust-toolchain.toml` | Install via rustup, MSVC toolchain |
| Node.js | 24 LTS | |
| pnpm | 12 | Pinned in `package.json` (`packageManager`) |
| Git for Windows | recent | |
| GitHub CLI | recent | Optional, used for releases and repo tasks |

WebView2 comes preinstalled on Windows 11.

## Clone to a short path

Clone to a short path such as `%USERPROFILE%\Projects\arden-code`. Deeply nested paths can
exceed Windows' 260-character limit and break some build tools.

## One-time machine setup (administrator PowerShell)

Exclude Rust build output from Microsoft Defender real-time scanning. This makes builds much faster:

```powershell
Add-MpPreference -ExclusionPath "$env:USERPROFILE\Projects\arden-code\target", "$env:USERPROFILE\.cargo"
```

Do **not** exclude `node_modules` or the pnpm store. Defender should keep scanning npm packages.

Enable long paths for Win32 applications:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

## Repository-local Git settings (run after cloning)

```powershell
git config core.longpaths true
git config core.autocrlf false
```

Line endings are enforced by `.gitattributes` (LF everywhere, CRLF for `.cmd` and `.bat`).
Commit with your GitHub noreply address if you don't want your email in public history:

```powershell
git config user.email "<id>+<username>@users.noreply.github.com"
```

## Build and run

Install dependencies once, then use the root scripts:

```powershell
pnpm install
pnpm dev          # the app with hot reload
pnpm build        # release build without an installer
pnpm check        # every check CI runs: format, lint, types, tests, bindings
pnpm bindings     # regenerate apps/desktop/src/ipc/bindings.ts after changing a Rust command
```

The Tauri CLI rejects `CI=1`; if your shell sets it, run `$env:CI = "true"` first.

## Checks and tools

`pnpm check` runs formatting, linting, type-checking, unused-code and hard-coded-text checks, and every test
(component tests run in a real Chromium; install it once with
`pnpm --filter @arden/desktop exec playwright install chromium-headless-shell`).

Two more checks run in CI and need tools installed with Cargo:

```powershell
cargo install cargo-deny typos-cli --locked
pnpm deny     # security advisories and licenses
pnpm typos    # spelling
```

`pnpm test:e2e` builds a debug app and drives it through WebView2 with Playwright.

`pnpm test:perf` builds the release app and measures start-up time, idle memory and CPU, and how long a
settings change takes, against the plan's targets: see [performance.md](performance.md).

`pnpm test:visual` runs screenshot and interaction tests of the design system page
(`/dev/design-system`, development builds only). After an intended visual change, update the baselines with
`pnpm test:visual:update` and look at the new images before committing them.

## Keeping test data separate

Set `ARDEN_CODE_DATA_DIR` to a folder and Arden Code keeps all its files (settings, window position, later logs)
inside it instead of in `%APPDATA%` and `%LOCALAPPDATA%`. The end-to-end tests use this so they never touch your
real data. Only one Arden Code can run at a time, so close your own copy before running `pnpm test:e2e`.

## Logs and crash reports

Arden Code writes JSON-lines logs, one file per day (UTC), to `%LOCALAPPDATA%\io.github.valasme.arden\logs`.
It keeps 14 days and at most 100 MB. Every line is redacted before it is written: your user folder, email
addresses and secrets such as API keys and tokens are replaced. Messages from the UI land in the same files.

- **More detail:** set `ARDEN_LOG=debug` (or `trace`) before starting the app.
- **Crash reports:** a Rust panic writes `crash-<date>-<time>-<pid>.json` to `%LOCALAPPDATA%\io.github.valasme.arden\crashes`.
- **Try it:** in a debug build (`pnpm build:debug`) or `pnpm dev`, open `/dev/errors` to make each kind of failure happen on purpose.

## Settings

Settings live in `%APPDATA%\io.github.valasme.arden\settings.json`, next to a generated `settings.schema.json` (add
`"$schema": "./settings.schema.json"`, which the app writes for you, and editors autocomplete the file). You can edit the
file by hand while the app runs: changes apply at once. If the file cannot be read, Arden Code keeps it as
`settings.invalid-<date>.json`, uses the defaults, and shows a notice with the code `ARD-SET-002`. The file being
replaced by each save is kept as `settings.backup.json`.

Every change to the file's shape needs a new version in `crates/arden-settings/src/settings.rs`, a migration in
`migrate.rs`, and a test.
