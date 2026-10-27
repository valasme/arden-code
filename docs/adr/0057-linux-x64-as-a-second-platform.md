# 0057. Linux x64 as a second platform

- Status: Accepted
- Date: 2026-10-27
- Supersedes [0004](0004-platform-windows-11-x64-tauri-2.md). Changes the tagline of
  [0002](0002-product-identity.md), the end-to-end and CI lines of
  [0019](0019-testing-and-quality-gates.md), the frame of [0009](0009-custom-title-bar-and-snap-layouts.md)
  ([0060](0060-the-linux-window-frame.md)), and plan sections 1, 4, 5.1, 6.1, 6.2, 15 and 16.

## Context

The maintainer asked for Arden Code on Linux, and mapped the decisions it needs in
[#179](https://github.com/valasme/arden-code/issues/179): four research tickets answered what Linux
offers, and six grilling tickets were left for the decisions. The map settled the ground rules on
2026-10-25: a **platform** is an operating system Arden Code is supported on; the support floor is any
current x64 desktop session, Wayland or X11, with no named distribution or desktop; CI is GitHub's
Ubuntu runner; WebKitGTK is the Linux web engine, because Tauri 2 uses it; and a Linux check, once it
exists, gates a merge as the Windows check does.

## Decision

- **Supported platforms:** Windows 11 x64 (build 22000 or later) and Linux x64. Still Tauri 2.12;
  WebView2 on Windows, WebKitGTK 4.1 on Linux.
- **The shared product** is the projects, sessions, agents, settings and the page. It is one design
  and one codebase, and both platforms' CI checks it: the portable Rust tests, the UI tests, lint,
  type-check, the bindings, and a build of the app.
- **Platform behavior** is the window frame, how programs end with the app, which system settings
  are read, where files live, the packages and the end-to-end test. Each has an ADR:
  [0058](0058-what-replaces-the-job-object-on-linux.md), [0059](0059-where-files-live-on-linux.md),
  [0060](0060-the-linux-window-frame.md), [0061](0061-the-desktop-settings-linux-reads.md),
  [0062](0062-linux-packages-and-updates.md) and [0063](0063-the-linux-end-to-end-test.md).
  A Windows behavior with no honest Linux counterpart stays on Windows.
- **Code:** `arden-linux` holds what only Linux does (processes through `/proc`, the desktop's
  settings, the system's name), as `arden-windows` does for Windows. The app asks through its
  `platform` module, and tells the page which platform it is on (`window.__ARDEN_PLATFORM__`).
- **CI:** a `Check (Linux)` job on `ubuntu-latest` runs beside `Check (Windows)` and gates a merge.
  The screenshot baselines, the performance gates and the installer test stay on Windows.
- **The terminal command** is the app itself on Linux: the package puts it on `PATH` as
  `arden-code`, and started with arguments it does what `arden-cli` does on Windows (ADR 0021).
- **Omarchy** is a check before a release, not a platform.

## Consequences

- `GLOSSARY.md` opens "A desktop cockpit where a developer runs and supervises coding agents on
  their projects," and defines **Platform**. The tagline becomes "A desktop cockpit for Claude Code
  and Codex."
- Shared copy names the system, not Windows, where it is true on both ("Same as the system").
- Not decided yet, and left to later work: whether the performance targets hold on Linux, how a
  Linux package is signed beyond its update signature, and macOS, Windows 10 and ARM64, which stay
  out of scope.
