`# 0018. Distribution, updates and code signing
`
`- Status: Accepted
`- Date: 2026-09-29
`
`## Context
`
`Releases are far off. Unsigned Windows installers trigger SmartScreen warnings. Azure Artifact
`Signing only accepts individual developers in the US and Canada.
`
`## Decision
`
`- **Installer:** NSIS, per-user (no admin prompt).
`  - It has a PATH option for `arden-code`, and the uninstaller offers "Also delete my settings and logs".
`  - It refuses Windows 10.
`- **Updates:** `tauri-plugin-updater` with signed manifests on GitHub Releases.
`  - It checks 10 seconds after launch and every 6 hours, downloads in the background, and installs on restart.
`  - Checks can be turned off.
`  - There is a stable channel only.
`- **Update-signing key:** kept in the maintainer's password manager and in a GitHub secret. Losing it would break auto-updates for every existing install.
`- **Channels:** GitHub Releases and winget. MSI and the Microsoft Store only on demand.
`- **Code signing:** deferred until the first public release, with a signing step ready in the pipeline.
`  - Candidates: Certum Open Source Code Signing (cloud) and SignPath Foundation.
`
`## Consequences
`
`- Development builds show SmartScreen warnings.
`- Choosing a signing vendor is a release-time decision.
`
`## What was built (ticket 25)
`
`- The installer is a per-user NSIS installer (\`installMode: currentUser\`), so it needs no administrator. It refuses Windows 10 with a message and installs nothing. The uninstaller's checkbox reads "Also delete my settings and logs" and removes both data folders.
`- The update signing key was made with the Tauri signer. Its public half is in \`tauri.conf.json\`; the private half is kept outside the repository and must be backed up and added as a secret by the maintainer (see \`docs/releasing.md\`).
`- A trial release workflow builds the installer, its update signature and \`latest.json\` and publishes none of it. The release and release-please workflows exist and are switched off by the repository variable \`RELEASES_ENABLED\`. Code signing is a step that does nothing until its secrets exist. A winget template is in \`packaging/winget\`.
`- The installer was installed silently into a temporary folder and uninstalled again, to check that it needs no administrator and leaves nothing behind.
