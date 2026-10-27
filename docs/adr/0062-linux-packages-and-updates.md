# 0062. Linux packages and updates

- Status: Accepted
- Date: 2026-10-27
- Decides [#186](https://github.com/valasme/arden-code/issues/186). Extends
  [0018](0018-distribution-updates-signing.md) and [0030](0030-updates.md).

## Context

The research in [#182](https://github.com/valasme/arden-code/issues/182) found that the pinned
bundler makes a `.deb`, an `.rpm` and an AppImage, and that `tauri-plugin-updater` installs an update
into each, after the same minisign check as on Windows. A program needs the C library of the machine
that built it, or a newer one. A person on any current x64 desktop must be able to install and run
the app.

## Decision

- **A release publishes all three:** a `.deb` (Debian, Ubuntu and their family), an `.rpm` (Fedora,
  openSUSE and theirs), and an AppImage for every other desktop, Omarchy and Arch included. Snap,
  Flatpak and a `PKGBUILD` are not published: the bundler does not make them.
- **They are built on Ubuntu 22.04**, the oldest release with WebKitGTK 4.1, so they run on it and
  on every newer system.
- **They update through the same signed updater as Windows,** with the same key. One `latest.json`
  lists `windows-x86_64`, `linux-x86_64-deb`, `linux-x86_64-rpm` and `linux-x86_64-appimage`, and
  `linux-x86_64` for the AppImage, which a copy installed some other way finds. The AppImage replaces
  itself; a `.deb` or `.rpm` update asks for the person's password through the desktop, as installing
  one does.
- The release trial builds the packages, installs the `.deb`, checks the terminal command and removes
  it, publishing nothing.

## Consequences

- How a Linux package is trusted beyond its update signature (a signed APT or RPM repository) is
  left for later; until then the packages are downloaded from GitHub Releases.
- The packages depend on the system's GTK 3 and WebKitGTK 4.1; the AppImage carries them.
