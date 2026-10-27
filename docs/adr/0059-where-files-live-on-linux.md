# 0059. Where files live on Linux

- Status: Accepted
- Date: 2026-10-27
- Decides [#181](https://github.com/valasme/arden-code/issues/181).

## Context

On Windows, settings are in `%APPDATA%\io.github.valasme.arden` and the sessions, logs, crash
reports, caches and the Playground in `%LOCALAPPDATA%\io.github.valasme.arden`. The app identifier
is permanent. Tauri's path API follows the XDG base directories on Linux. The app also needs the
folders before Tauri can be asked, to finish a reset.

## Decision

- **Settings and the window's place** (`config`): `$XDG_CONFIG_HOME/io.github.valasme.arden`, or
  `~/.config/io.github.valasme.arden`.
- **Sessions, logs, crash reports, caches, the web engine's files and the Playground** (`local`):
  `$XDG_DATA_HOME/io.github.valasme.arden`, or `~/.local/share/io.github.valasme.arden`.
- They come from Tauri's `config_dir` and `local_data_dir`, as on Windows. Before Tauri is up, the
  same folders are worked out from the same variables (`arden_core::paths::xdg_folder`), ignoring a
  relative path as the specification says.
- `ARDEN_CODE_DATA_DIR` still moves everything into one folder, as on Windows.

## Consequences

- One `local` folder holds what a reset wipes, as on Windows. Logs and caches are not split into
  `$XDG_STATE_HOME` and `$XDG_CACHE_HOME`: a reset, the diagnostics bundle and the uninstall note
  would each have to know three folders, for no gain the person sees.
- Nothing roams on Linux; `config` and `local` differ only in what they hold.
