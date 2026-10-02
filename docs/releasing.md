# Releasing Arden Code

How a release is made, what is switched off until you switch it on, and the steps only a person can
do. The decisions behind it are in ADR 0018 (distribution, updates and signing) and ADR 0030 (updates).

## What exists

| Piece | Where | State |
|---|---|---|
| The installer | `apps/desktop/src-tauri/installer/` and `tauri.conf.json` | Per-user (no administrator), Windows 11 only, "Also delete my settings and logs" on uninstall |
| The update signature | `tauri build` with the update key in the environment | Made for every installer |
| `latest.json` | `scripts/latest-json.ts` | Made from the installer's signature |
| Trial release | `.github/workflows/release-trial.yml` | **On.** Builds all of it, publishes nothing |
| Release | `.github/workflows/release.yml` | **Off** until `RELEASES_ENABLED` is `true` |
| Version and changelog | `.github/workflows/release-please.yml`, `release-please-config.json` | **Off** until `RELEASES_ENABLED` is `true` |
| Build provenance | `actions/attest-build-provenance` in the release workflow | Runs with the release |
| Code signing | A step in the release workflow | **Off** until the certificate secrets exist |
| winget | `packaging/winget/` | Templates; filled in by hand for each release |

## Try it: the trial release

Run **Release trial** from the Actions tab, or open a pull request that changes a file that shapes a
release. It builds the installer, its update signature and `latest.json`, checks that they exist, and
keeps them as a build artifact for three days. It signs with a throwaway key until the real key is a
secret, and says so as a warning.

## Steps only a person can do

1. **Back up the update signing key.** It is at `%USERPROFILE%\.tauri\arden-code-update.key` on the
   computer that made it. Put a copy in your password manager. Lose it, and no installed copy can ever
   be updated: an update signed with another key is refused.
2. **Add the key as a repository secret** (Settings → Secrets and variables → Actions):
   `TAURI_SIGNING_PRIVATE_KEY`, the whole contents of the key file. The key has no password, so
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` stays unset. From PowerShell (which has no `<` redirection):

   ```powershell
   gh secret set TAURI_SIGNING_PRIVATE_KEY --repo valasme/arden-code --body (Get-Content -Raw "$env:USERPROFILE\.tauri\arden-code-update.key").Trim()
   ```

   Then run **Release trial** from the Actions tab: its "Choose the update signing key" step says
   "Signing with the real update key". If it warns that the secret is not set, the secret is empty.
   Signed with the real key, the trial and the release both check that the signature was made with the
   key the app trusts (`plugins.updater.pubkey` in `tauri.conf.json`), and fail if it was not.
3. **Switch releases on** when the trial is green: add the repository variable `RELEASES_ENABLED` with
   the value `true`. From then on, release-please keeps a release pull request open. Merging it tags
   the version and the release workflow uploads the installer, its signature and `latest.json`.
4. **Code signing (optional, later).** Buy or get a certificate, and add
   `WINDOWS_CODE_SIGNING_CERTIFICATE` (the .pfx file as base64) and `WINDOWS_CODE_SIGNING_PASSWORD`.
   The step in the release workflow then signs the installer and remakes its update signature. Without
   it Windows SmartScreen warns about an unknown publisher.
5. **winget (optional, later).** For each release, fill in the three files in `packaging/winget/`
   (`{{version}}`, `{{installerUrl}}` and `{{sha256}}` of the installer) and send them to
   `microsoft/winget-pkgs`, or use `wingetcreate`.

## Known gaps

- release-please updates the version in `Cargo.toml` and the `package.json` files, not in
  `Cargo.lock`. The Release PR workflow therefore runs `cargo update --workspace` on the release pull
  request and commits the lock file there, each time release-please updates it, so nothing is left to
  do by hand. A commit made with the workflow's own token starts no CI run on that pull request; CI runs
  on `main` when it is merged.
- The installer's "Terminal command" page comes before its first page, not after the folder page.
  Tauri includes the installer hooks before its own list of pages, and NSIS shows pages in the order
  they are declared, so a hook can only add a page at the start (and MUI's page callbacks, defined
  there, would attach to the welcome page). Moving it needs a copy of Tauri's whole NSIS template
  (`bundle.windows.nsis.template`), merged by hand on every Tauri update. The page asks one question
  and silent and passive installs never show it, so it stays first.
- The installer refuses Windows 10 when it reaches its install step, after Windows' WebView2 check, not
  before its first page. Nothing is installed either way.
