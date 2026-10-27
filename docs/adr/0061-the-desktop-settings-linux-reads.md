# 0061. The desktop settings Linux reads

- Status: Accepted
- Date: 2026-10-27
- Decides [#189](https://github.com/valasme/arden-code/issues/189).

## Context

Windows supplies the regional format, the text size, the contrast theme and reduced motion. The
research in [#185](https://github.com/valasme/arden-code/issues/185) found that Linux exposes each
in a different place, and not always the same way on Wayland and X11 or on GNOME and KDE.

## Decision

- **Regional format:** the locale the session gave the app, as every Linux program reads it:
  `LC_ALL`, then `LC_TIME`, then `LC_NUMERIC`, then `LANG`. `en_GB.UTF-8` becomes `en-GB`; `C` and
  `POSIX` mean the fallback, `en-US`. It is read at the start: a new regional format is seen at the
  next start, as by every Linux program.
- **Text size:** GTK's font resolution (`gtk-xft-dpi`) against 96 dots per inch. On GNOME it is the
  text scaling factor, on Wayland and on X11 alike, and other desktops set it as their font
  resolution. GTK says when it changes, and the page is told, as on Windows. It is read on GTK's
  thread and kept for the others. It is brought inside the 100–225 % the interface is drawn at.
- **Reduced motion:** through the web engine, as on Windows. WebKitGTK reports
  `prefers-reduced-motion` from GTK's animations setting, which the page already follows.
- **Contrast themes stay on Windows.** WebKitGTK reports no forced colors, and the portal's contrast
  key is answered by GNOME only.

## Consequences

- No D-Bus or portal client is added: GTK, which Tauri links already, answers the text size.
- `SystemPreferences` and the stand-in file of debug builds move to `arden-core`, shared by both
  platforms' crates.
