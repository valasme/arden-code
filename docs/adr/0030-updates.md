# 0030. Updates

- Status: Accepted
- Date: 2026-09-30

## Context

Plan section 6.7 and ADR 0018 ask for signed automatic updates that never interrupt the person.

## Decision

- **The official updater plugin** does the work: it reads a manifest (`latest.json`) from the project's GitHub releases, compares versions, downloads the installer and checks its signature against the public key in `tauri.conf.json`. An update that is not signed by the matching private key is thrown away, whatever the manifest says. A manifest with no signature is refused as well.
- **When it looks**: ten seconds after the app starts, so it never slows the start, and every six hours after that. Each time, it first checks that `general.checkForUpdates` is still on, so turning the setting off stops the checks at once and never asks the server again.
- **Downloads happen in the background.** A found update is downloaded and checked without a window or a toast. The status bar then shows "Update ready: restart", and the person restarts when it suits them; nothing restarts by itself. While it downloads, the status bar says so in one quiet line.
- **About → Check for updates** does the same on request and says the result in words: up to date, an update is ready, could not check, or the signature is not valid.
- **Failing quietly.** Until the first release exists the address answers "not found"; without internet it does not answer. Both are normal, are written to the log at info level, and show nothing, unless the person asked for the check.
- **The signing key** is made once with the Tauri signer. Its public half is in the repository; its private half is kept outside it, backed up by the maintainer, and given to the release pipeline as a secret (ticket 25). Losing it means no installed copy can be updated, so it is also the one thing a reader of the release checklist must not skip.
- **Tests use keys of their own.** The end-to-end tests make two throwaway keys, serve manifests from a local server, and point a debug build at it with environment variables that do not exist in release builds. They cover: a release signed with the app's key is offered; one signed with another key, one with a signature that is not one, and one with no signature are refused; the same version is not an update; no release is a calm message and a log line; the scheduler looks by itself; and with automatic checks off it never asks.

## Consequences

- The installer is only run when the person asks to restart, so the tests stop at "ready".
- Update artifacts are made by bundling with the private key in the environment (ticket 25); the everyday builds do not bundle and need no key.
