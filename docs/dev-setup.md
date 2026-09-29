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
