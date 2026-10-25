# Linux packages the pinned Tauri can publish: research

- Date: 2026-10-25
- Question: What Linux packages can the pinned Tauri produce, and how does `tauri-plugin-updater` update each of them? What does each package assume about the distro, libc, desktop session, and libraries such as WebKitGTK, and does the signed GitHub updater used on Windows apply to it?
- Read at: this repo at `0ee2141` (2026-10-25); `tauri` 2.12.0, `tauri-utils` 2.10.0, `tauri-bundler` 2.10.0 and `tauri-cli` 2.12.0, published 2026-09-26 from `tauri-apps/tauri` `447fa9f3`; `tauri-plugin-updater` 2.13.1, published 2026-09-29 from `tauri-apps/plugins-workspace` `e5112843`; Tauri v2 docs read on 2026-10-25; GitHub's hosted-runner reference and the Ubuntu 24.04 runner-image README (image `20261023.334.3`) read the same day.

## The answer in short

- **The bundler emits three Linux packages:** a Debian package (`.deb`), an RPM package (`.rpm`), and an AppImage. On a Linux target, those three are the whole native set. Snap, Flatpak, and an Arch `PKGBUILD` are separate guides. Each of those guides starts from a `.deb` the bundler already built. [BND] [UTIL] [DIST]
- **A `.deb` and an `.rpm` install the binary to `/usr/bin` and a FreeDesktop entry, and they leave GTK 3 and WebKitGTK 4.1 on the system.** The CLI adds `libwebkit2gtk-4.1-0` and `libgtk-3-0` to the `.deb`, and the matching SONAMEs (`libwebkit2gtk-4.1.so.0`, `libgtk-3.so.0`, with `()(64bit)` on x86_64) to the `.rpm`. An AppImage is one file. Its build copies WebKitGTK 4.1's helper processes off the build machine and runs linuxdeploy with a GTK 3 plugin. [CLI] [DEB] [RPM] [APP] [DOC-DEB] [DOC-APP]
- **The glibc the binary requires is the glibc of the machine that built it.** Tauri names Ubuntu 22.04 and Debian 12 as baselines that already ship WebKitGTK 4.1 from their own repositories. Building on a newer system can raise the glibc the package requires at runtime. The same paragraph is on the Debian, RPM, and AppImage pages. [DOC-DEB] [DOC-RPM] [DOC-APP]
- **`tauri-plugin-updater` 2.13.1 can install an update into each of the three.** It verifies the download with minisign against `plugins.updater.pubkey`, then replaces an AppImage in place, runs `dpkg -i` for a `.deb`, or runs `rpm -U` for an `.rpm`. The package install goes through `pkexec`, then a zenity or kdialog password prompt, then `sudo`. The plugin has no Snap, Flatpak, or pacman installer. [UPD]
- **The Windows updater's signature and GitHub manifest are the same mechanism, and the manifest this repo publishes is a Windows entry.** The endpoint, the public key, and the minisign check are shared. `windows.installMode` (`passive` here) is applied when the plugin runs an NSIS or MSI installer. The release workflow writes one `latest.json` key, `windows-x86_64`, for that NSIS installer. A Linux app looks up `linux-x86_64-deb`, `linux-x86_64-rpm`, or `linux-x86_64-appimage`, then `linux-x86_64`. A file that has only `windows-x86_64` fails that lookup. [UPD] [CONF] [JSON] [REL]
- **Tauri's own Actions example builds Linux on `ubuntu-22.04`.** GitHub's runner reference, read on this date, points the `ubuntu-latest` label at the Ubuntu 24.04 image. That image's README says the label will move to Ubuntu 26.04 in November 2026. [DOC-GHA] [GH] [IMG]

## What is pinned

`apps/desktop/src-tauri/Cargo.toml` depends on `tauri` 2.12 with the `isolation` feature added to the crate's defaults, and on `tauri-plugin-updater` 2 with default features off and `rustls-tls` and `system-proxy` on. `Cargo.lock` resolves `tauri` 2.12.0 and `tauri-plugin-updater` 2.13.1. The desktop package takes `@tauri-apps/cli` from the catalog at 2.12.0. [PIN]

`tauri` 2.12.0's default features include `wry`, which on Linux enables the `webkit2gtk` dependency with feature `v2_40`, and `gtk` 0.18 with feature `v3_24`. The defaults also include `x11` and `dbus`. `tray-icon` is off, and this app does not turn it on. [CORE] [PIN]

The updater crate's own defaults are `rustls-tls`, `system-proxy`, and `zip`. This app turns defaults off and lists the first two again, so `zip` stays off. `rustls-tls` is `reqwest` with `rustls-no-provider` plus the `rustls` crate. The crate metadata marks Linux, Windows, and macOS support as full, and Android and iOS as none. It requires Rust 1.90. [UPD]

`tauri-cli` 2.12.0 depends on `tauri-bundler` exactly 2.10.0. That bundler's Linux support, in its own words, is "Appimage, Debian and RPM packages." [CLI] [BND]

`bundle.targets` in this app is `["nsis"]`, `createUpdaterArtifacts` is `true`, and the updater endpoint is `https://github.com/valasme/arden-code/releases/latest/download/latest.json`. The Windows install mode is `passive`. Those are the Windows release settings. The sections below are what the same CLI and plugin do when the target is Linux. [CONF]

## The three packages the bundler emits

`BundleType` is `deb`, `rpm`, `appimage`, `msi`, `nsis`, `app`, and `dmg`. For a Linux target the bundler keeps `deb`, `rpm`, and `appimage`. `PackageType::all()` lists those three under `target_os = "linux"`, plus the updater artifact. NSIS can be produced on a Linux host when the target is Windows. It is a Windows installer. [UTIL] [BND]

Each bundled Linux binary is patched. The bytes `__TAURI_BUNDLE_TYPE_VAR_UNK` inside the executable are replaced with `__TAURI_BUNDLE_TYPE_VAR_DEB`, `__TAURI_BUNDLE_TYPE_VAR_RPM`, or `__TAURI_BUNDLE_TYPE_VAR_APP`. At runtime `bundle_type()` reads that string back. An unpatched Linux binary returns `None`. The CLI flag `--no-binary-patching` skips the rewrite and, in the flag's own help, gives up per-bundle updater selection. If the patch fails, the bundler warns that the updater may be unable to update that package. [BND] [UTIL] [CLI]

While the CLI is running on Linux it always appends the WebKit and GTK dependencies below. It appends an appindicator dependency only when the crate features include `tray-icon` or `tauri/tray-icon`: `libayatana-appindicator3-1` on the `.deb` and `libayatana-appindicator3.so.1` on the `.rpm`, or the older `libappindicator3-1` / `libappindicator3.so.1` when that is the library pkg-config finds. This app's feature list does not include `tray-icon`, so a bundle of this crate gets the WebKit and GTK lines only. [CLI] [PIN]

### Debian package

The bundler writes an ar archive in Debian binary format 2.0: `debian-binary`, `control.tar.gz`, and `data.tar.gz`. For x86_64 the architecture field is `amd64` and the file is `{product}_{version}_amd64.deb`, under `target/release/bundle/deb/`. The binary is installed at `/usr/bin/{name}`. Icons go under `/usr/share/icons/hicolor`. A FreeDesktop desktop file is written to `/usr/share/applications/{product}.desktop` from a template whose `Type` is `Application` and whose `Terminal` is `false`. The template names no desktop session. [DEB] [DESK]

The control file's `Depends` line is whatever the CLI put in `deb.depends`. On a Linux build that is `libwebkit2gtk-4.1-0` and `libgtk-3-0`, plus the appindicator package when the tray feature is on. The package does not carry those libraries itself. Tauri's Debian page describes this package as what you ship to Debian-based distributions, and it names the same three dependencies, with `libappindicator3-1` for a tray. [DEB] [CLI] [DOC-DEB]

The desktop entry is the session assumption the bundler records: a FreeDesktop application menu entry. The window is GTK 3 (`gtk` feature `v3_24`) with the `x11` feature on by default. The Flatpak guide is the page that names the sockets a window needs, Wayland and a fallback X11 socket. [CORE] [DESK] [DOC-FLAT]

### RPM package

The bundler builds the RPM with the `rpm` crate. For x86_64 the file is `{product}-{version}-{release}.x86_64.rpm` under `target/release/bundle/rpm/`. An empty `release` is written as `1`. The binary, the desktop file, and the hicolor icons land on the same `/usr` paths as the `.deb`. [RPM] [DESK]

Requirements are `rpm.depends`. On a 64-bit Linux build the CLI pushes `libwebkit2gtk-4.1.so.0()(64bit)` and `libgtk-3.so.0()(64bit)`, and the appindicator SONAME with the same suffix when the tray feature is on. [CLI] [RPM]

`TAURI_SIGNING_RPM_KEY` and `TAURI_SIGNING_RPM_KEY_PASSPHRASE` attach a PGP signature to the RPM. That key is separate from the updater's minisign key. With the variables unset, the package is written unsigned. Tauri's RPM page treats that PGP signature as optional and shows how to check it with `rpm --checksig`. [RPM] [DOC-RPM]

### AppImage

The file is `{product}_{version}_amd64.AppImage` under `target/release/bundle/appimage/`. Tauri's page says it bundles the dependencies the app needs, so it is larger and runs without a package install: `chmod a+x`, then run the file. The desktop entry inside is the same FreeDesktop template. [APP] [DOC-APP] [DESK]

The build copies `WebKitNetworkProcess`, `WebKitWebProcess`, and `injected-bundle/libwebkit2gtkinjectedbundle.so` from `webkit2gtk-4.1` on the build machine (`/usr/lib/x86_64-linux-gnu`, `/usr/lib64`, `/usr/lib`, or `/usr/libexec`). It then runs linuxdeploy `07333c6` with `--plugin gtk` and `--output appimage`. The GTK plugin in the bundler forces `DEPLOY_GTK_VERSION=3` and copies the GTK 3 modules pkg-config reports. `bundleMediaFramework` adds the gstreamer plugin. Tauri's page says that flag is fully supported on Ubuntu build systems, and that the `ugly` gstreamer plugins have a license that can make them hard to ship. Custom extra files have to be placed at a destination that starts with `/usr/`. [APP] [GTK] [DOC-APP]

linuxdeploy itself is started with `APPIMAGE_EXTRACT_AND_RUN=1`. That is how the build runs the tool. [APP]

An AppImage can also carry a GPG signature (`SIGN=1`, optional `SIGN_KEY`, and `APPIMAGETOOL_SIGN_PASSPHRASE` in CI). Tauri's signing page says AppImage does not check that signature. The person checks it with AppImage's validate tool. The updater's minisign signature is a different signature, of the update bytes, checked by the plugin. [DOC-SIGN] [UPD]

### glibc, and the other distros Tauri names

The Debian, RPM, and AppImage pages share one limitation. glibc breaks compatibility with older systems, so the build machine should be the oldest system you intend to run on that also has WebKitGTK 4.1. Ubuntu 22.04 and Debian 12 are the examples, because their repositories contain `libwebkit2gtk-4.1-dev`. A newer build machine can raise the required glibc, and the runtime error they quote is `/usr/lib/libc.so.6: version 'GLIBC_2.33' not found`. They recommend a container or GitHub Actions for the Linux build. [DOC-DEB] [DOC-RPM] [DOC-APP]

The prerequisite page names the build packages per distro. Debian and Alpine use `libwebkit2gtk-4.1-dev`. Arch uses `webkit2gtk-4.1`. Fedora and OSTree use `webkit2gtk4.1-devel`. openSUSE's line is `webkit2gtk3-devel`. Gentoo's is `net-libs/webkit-gtk:4.1`. Alpine is called out as musl: Rust links a number of system libraries statically, and some of those static packages are missing. The bundler still has the same three package types on a Linux target. It does not grow a musl-specific package. [DOC-PRE] [BND]

## Snap, Flatpak, and the Arch User Repository

The distribute page lists these next to the three packages above. They are guides for packing a build, and the bundler's `BundleType` enum has no variant for them. [DIST] [UTIL]

**Snap.** The guide registers a name, writes `snapcraft.yaml` with `base: core22` and `confinement: strict`, and builds with `npm run tauri build -- --bundles deb`, then `dpkg -x` of that `.deb` into the snap. `stage-packages` lists `libwebkit2gtk-4.1-0` and `libayatana-appindicator3-1`. The gnome extension, the guide says, already includes desktop, Wayland, and X11. Publishing is `snapcraft upload --release=stable`. [DOC-SNAP]

**Flatpak.** One manifest builds inside `org.gnome.Platform` `47` by running `yarn run tauri build -- -b deb` and unpacking it. Another installs a `.deb` already hosted on a GitHub release. Finish arguments include `--socket=wayland` and `--socket=fallback-x11`, each commented as the permission needed to show the window. The guide says the GNOME 46 runtime includes the dependencies of a standard Tauri app. Updating a local test build is `flatpak -y --user update`. Publishing is a pull request to Flathub. [DOC-FLAT]

**AUR.** The sample `PKGBUILD` depends on `cairo`, `desktop-file-utils`, `gdk-pixbuf2`, `glib2`, `gtk3`, `hicolor-icon-theme`, `libsoup`, `pango`, and `webkit2gtk-4.1`. One sample unpacks the published `.deb`. Another runs `pnpm tauri build -b deb` and copies that package's data. Publishing is a git push to the AUR. [DOC-AUR]

A binary produced by `--bundles deb` carries the deb marker. Unpacking that `.deb` into a snap, a Flatpak, or an AUR package keeps the marker. `bundle_type()` on that process is `Deb`, so the updater selects the `dpkg -i` path described below. The three guides describe Snapcraft, `flatpak update`, and the AUR git repo as the way those packages are published. [BND] [UTIL] [UPD] [DOC-SNAP] [DOC-FLAT] [DOC-AUR]

## How the updater installs each one

`createUpdaterArtifacts: true` is the v2 setting. The bundler then treats AppImage, `.deb`, and `.rpm` as artifacts the v2 plugin installs directly, and the CLI signs each of those files with minisign. The signature file is the package path plus `.sig`, and the file contents are the base64 of the minisign signature. The trusted comment includes `version:` set to the app version. [BND] [CLI]

`createUpdaterArtifacts: "v1Compatible"` is the legacy path. On Linux that path wraps the AppImage in `{name}.AppImage.tar.gz` and signs the archive. The bundler says the legacy updater supports the AppImage (and the macOS app, MSI, and NSIS), and that `.deb` and `.rpm` can be installed by the v2 plugin. The v2 updater doc, last updated 2025-11-28, still describes only the AppImage and its `.sig` as the Linux update files. The CLI and plugin published in September 2026 are the source for `.deb` and `.rpm` as well. [BND] [DOC-UPD]

This app's updater is built without the `zip` feature. The code that unpacks a `.tar.gz` AppImage or a `.zip` Windows installer is compiled only with that feature. With `createUpdaterArtifacts: true` the signed Linux artifact is the package file itself, which this build installs as raw bytes. [UPD] [PIN] [BND]

The check fetches the endpoint over the rustls client. In a release build the endpoint has to be `https` unless `dangerousInsecureTransportProtocol` is set. A non-2XX response moves on to the next endpoint. A 2XX body is parsed as one manifest. The manifest is not signed. The signature covers the downloaded bytes. [UPD] [DOC-UPD]

For a static manifest the platform value is `url` plus `signature`. The plugin looks up `{os}-{arch}-{bundle}` and then `{os}-{arch}`. On x86_64 Linux that is `linux-x86_64-appimage`, `linux-x86_64-deb`, or `linux-x86_64-rpm`, and then `linux-x86_64`. The bundle suffix is present when the binary was patched. An unpatched Linux binary searches `linux-x86_64` only. A missing key is `TargetsNotFound`, returned from `check` after a manifest has parsed, including when the version is not newer. [UPD]

The signature is minisign, verified with the public key before any install. The key in the config is base64 of the minisign public key text, and the manifest's `signature` is base64 of the signature text. The check cannot be turned off. When the trusted comment contains `version:`, that version has to match the version the manifest announced, whether or not `requireSignedVersion` is set. `requireSignedVersion` defaults to false and adds a further refusal of signatures that carry no version. The CLI 2.12 signer writes the version into the comment. [UPD] [CLI] [DOC-UPD]

Install then branches on the patched bundle type:

- **AppImage, and any Linux bundle type other than deb or rpm.** The path replaced is the `APPIMAGE` environment variable when Tauri recorded one, otherwise the current executable. The plugin renames that file aside, writes the new bytes, and puts the old permissions back. The temporary directory has to be on the same device (`st_dev`) as the AppImage, or the install returns `TempDirNotOnSameMountPoint` and leaves the old file in place. Tauri reads `APPIMAGE` and `APPDIR` from the environment and warns when those are set but the executable is outside the `/.mount_` directory AppImage uses. [UPD] [UTIL]
- **`.deb`.** The bytes have to look like a deb archive. The plugin writes them to a temp file and runs `dpkg -i`. It tries `pkexec` first, then a password from zenity or kdialog piped to `sudo -S`, then `sudo`. [UPD]
- **`.rpm`.** The bytes have to look like an RPM. The same three privilege attempts run `rpm -U`. [UPD]

On Linux the plugin returns after that install. The process keeps running until the app relaunches. On Windows the plugin starts the NSIS or MSI installer and exits. `installMode` is read in the Windows install path. `passive`, which this app sets, is a Windows installer flag. The Linux install commands above do not take it. [UPD] [CONF] [DOC-UPD]

## The signed manifest on GitHub Releases

The plugin treats the endpoint as a URL. The v2 updater page's example of a static file is `https://github.com/user/repo/releases/latest/download/latest.json`, which is the shape of this app's endpoint. A platform entry's `url` is where the package bytes are downloaded. The plugin does not otherwise special-case GitHub. Tauri Action is documented as one generator of that JSON. This repo generates it with `scripts/latest-json.ts`. [DOC-UPD] [CONF] [JSON]

The script's platform name has to match `windows|linux|darwin`, then `x86_64|aarch64|i686|armv7`, with an optional `-[a-z]+` suffix. `linux-x86_64` and `linux-x86_64-deb` both match. The release workflow does not pass `--platform`, so the key it writes is the default `windows-x86_64`. The URL is the NSIS installer on that GitHub release, and the signature is that installer's `.sig`. The workflow runs on `windows-latest` and uploads the installer, the `.sig`, and `latest.json`. [JSON] [REL]

A Linux process pointed at that file parses the manifest, finds neither `linux-x86_64-{bundle}` nor `linux-x86_64`, and `check` returns `TargetsNotFound`. It does not download the NSIS installer. The minisign check is of the bytes that were signed. A signature made for the Windows installer verifies that installer. [UPD] [JSON]

Putting a Linux package on the same `latest.json` is the same file, the same public key, and the same endpoint. The Linux entry's `url` has to be the package the running bundle will install: AppImage bytes for an AppImage (or for an unpatched binary, which takes the AppImage install path), a `.deb` for a binary patched as deb, an `.rpm` for a binary patched as rpm. A `.deb` install rejects bytes that are not a deb archive, and an `.rpm` install rejects bytes that are not an RPM, before it asks for a password. One shared `linux-x86_64` entry is what every Linux bundle uses when its more specific key is absent, so that entry has to be the file type that bundle will install. [UPD]

The updater page says the whole static file is validated before the version is considered, and that every platform entry in it has to be complete. A `platforms` value in the plugin is `url` plus `signature`. An entry missing either one fails parsing for every platform, Windows included. [DOC-UPD] [UPD]

## GitHub's Ubuntu runner

Tauri's Actions guide builds Linux x64 on `ubuntu-22.04` and, on that job, installs `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, and `xdg-utils`. The arm section of the same page says GitHub provides `ubuntu-22.04-arm` and `ubuntu-24.04-arm` runners. The x64 example stays on `ubuntu-22.04`, the baseline the Debian, RPM, and AppImage pages name. [DOC-GHA] [DOC-DEB]

GitHub's hosted-runner reference, read on 2026-10-25, lists `ubuntu-latest` and `ubuntu-24.04` against `images/ubuntu/Ubuntu2404-Readme.md`, and `ubuntu-22.04` against `Ubuntu2204-Readme.md`. The 24.04 README's image `20261023.334.3` is titled Ubuntu 24.04, OS version 24.04.5 LTS. Its announcement table says the `ubuntu-latest` label will use Ubuntu 26.04 in November 2026, and that the Ubuntu 22 runner images will begin deprecation on September 17th and be fully unsupported by April 17th. The 22.04 image README lists `libc6-dev` 2.35. Tauri's glibc warning is the implication it states for building on a newer system than the 22.04 baseline: the package can require a newer glibc than an older desktop has. [GH] [IMG] [DOC-DEB]

The 24.04 image README lists `patchelf` and `rpm` among its packages and does not list `libwebkit2gtk`. Tauri's workflow installs `libwebkit2gtk-4.1-dev` itself on the Ubuntu job. [IMG] [DOC-GHA]

## Sources

- [PIN] This repo at `0ee2141`: `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock` (`tauri` 2.12.0, `tauri-plugin-updater` 2.13.1, `tauri-utils` 2.10.0), `pnpm-workspace.yaml` (`@tauri-apps/cli` 2.12.0), `apps/desktop/src-tauri/tauri.conf.json`.
- [CORE] `tauri` 2.12.0, crates.io 2026-09-26, `tauri-apps/tauri` `447fa9f3`: `Cargo.toml` features and the Linux `gtk` / `webkit2gtk` dependencies. <https://github.com/tauri-apps/tauri/blob/447fa9f3f993fe77724189e355078b38ce20baea/crates/tauri/Cargo.toml>
- [UTIL] `tauri-utils` 2.10.0, same commit: `BundleType` and the target list in `src/config.rs`; `bundle_type` and the `APPIMAGE` environment in `src/platform.rs` and `src/lib.rs`. <https://github.com/tauri-apps/tauri/blob/447fa9f3f993fe77724189e355078b38ce20baea/crates/tauri-utils/src/platform.rs>
- [BND] `tauri-bundler` 2.10.0, same commit: `src/lib.rs`, `src/bundle.rs` (patching, which Linux packages are updater targets), `src/bundle/settings.rs`, `src/bundle/updater_bundle.rs`. <https://github.com/tauri-apps/tauri/blob/447fa9f3f993fe77724189e355078b38ce20baea/crates/tauri-bundler/src/bundle.rs>
- [DEB] `src/bundle/linux/debian.rs` at that commit.
- [RPM] `src/bundle/linux/rpm.rs` at that commit.
- [APP] `src/bundle/linux/appimage/linuxdeploy.rs` at that commit.
- [GTK] `src/bundle/linux/appimage/linuxdeploy-plugin-gtk.sh` at that commit.
- [DESK] `src/bundle/linux/freedesktop/mod.rs` and `main.desktop` at that commit.
- [CLI] `tauri-cli` 2.12.0, same commit: `src/interface/rust.rs` (the dependency lines), `src/bundle.rs` (which files are signed, `--no-binary-patching`), `src/helpers/updater_signature.rs`. The crates.io index records `tauri-bundler` `=2.10.0`.
- [UPD] `tauri-plugin-updater` 2.13.1, crates.io 2026-09-29, `tauri-apps/plugins-workspace` `e5112843`: `Cargo.toml`, `src/updater.rs`, `src/lib.rs`, `src/config.rs`. <https://github.com/tauri-apps/plugins-workspace/blob/e51128438011755f9e7277bad29b8c0978cf281c/plugins/updater/src/updater.rs>
- [CONF] [JSON] [REL] This repo: `apps/desktop/src-tauri/tauri.conf.json`, `scripts/latest-json.ts`, `.github/workflows/release.yml`.
- [DIST] Distribute, <https://v2.tauri.app/distribute/>, last updated 2026-07-22, read 2026-10-25.
- [DOC-DEB] Debian, <https://v2.tauri.app/distribute/debian/>, last updated 2026-05-17.
- [DOC-RPM] RPM, <https://v2.tauri.app/distribute/rpm/>, last updated 2026-09-21.
- [DOC-APP] AppImage, <https://v2.tauri.app/distribute/appimage/>, last updated 2026-05-17.
- [DOC-SNAP] Snapcraft, <https://v2.tauri.app/distribute/snapcraft/>, last updated 2025-09-26.
- [DOC-FLAT] Flathub, <https://v2.tauri.app/distribute/flatpak/>, last updated 2026-09-21.
- [DOC-AUR] AUR, <https://v2.tauri.app/distribute/aur/>, last updated 2026-06-02.
- [DOC-SIGN] Linux code signing, <https://v2.tauri.app/distribute/sign/linux/>, last updated 2025-02-22.
- [DOC-UPD] Updater, <https://v2.tauri.app/plugin/updater/>, last updated 2025-11-28.
- [DOC-PRE] Prerequisites, <https://v2.tauri.app/start/prerequisites/>, last updated 2026-08-20.
- [DOC-GHA] GitHub, <https://v2.tauri.app/distribute/pipelines/github/>, last updated 2026-06-29.
- [GH] GitHub-hosted runners reference, <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>, read 2026-10-25.
- [IMG] `actions/runner-images` `images/ubuntu/Ubuntu2404-Readme.md` (image `20261023.334.3`) and `Ubuntu2204-Readme.md`, read 2026-10-25. <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>
