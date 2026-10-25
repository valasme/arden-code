# Which desktop settings a Tauri app can read on Linux

- Date: 2026-10-25
- Question: Which of the OS settings Arden Code honors on Windows can a Tauri app read on a Linux desktop? Windows supplies the regional format, text size, contrast theme, and reduced motion. What does a Linux desktop expose for each, and where do Wayland and X11 differ?
- Read at: Arden Code at `0ee2141` (2026-10-25). The Settings portal interface in xdg-desktop-portal at `49075617` (2026-10-20). GNOME schemas at `368be612` (2026-10-19), xdg-desktop-portal-gnome at `f613aa2c` (2026-10-19), and gnome-settings-daemon at `d3e71700` (2026-10-19). GTK 4 at `c36202f6` (2026-10-25) and GTK 3.24 at `0f3aa454` (2026-10-07). KDE's xdg-desktop-portal-kde at `936476a5` (2026-10-20). WebKitGTK 2.54.2, tagged 2026-10-23. Tauri 2.12.0's wry 0.57.0 and tao 0.37.1, as locked in this tree; wry 0.57.1 (2026-10-23) still depends on the same GTK 3 crates. Chromium `main` on 2026-10-25 for the Windows engine's Win32 reads. The CSS Media Queries Level 5 Working Draft of 19 February 2026.

## The answer in short

- **Regional format.** A Linux process reads this from the locale environment, through libc. `LC_ALL` wins, then the category (`LC_TIME` for dates, `LC_NUMERIC` for numbers), then `LANG`. systemd's `/etc/locale.conf` is the system-wide default those variables inherit. GNOME also stores one format locale in `org.gnome.system.locale` `region`. KDE stores Numbers, Time, Currency, and Measurement in `~/.config/plasma-localerc`. The Settings portal has no locale key. Wayland and X11 use the same environment. No portal backend is involved. [LOCALE] [LOCALECONF] [GSCHEMA] [KDEDOC]
- **Text size.** GNOME's value is `org.gnome.desktop.interface` `text-scaling-factor`, a double from 0.5 to 3.0, default 1.0, described as enlarging text without changing the font size. It is separate from `scaling-factor`, the integer window scale. The GNOME portal backend republishes that GSettings key; the portal spec does not list a text-size key, and calls anything outside its list an implementation detail. On Wayland, GTK turns the factor into a font dpi of `96 × factor`. On X11, GNOME's XSETTINGS manager publishes `Gdk/UnscaledDPI` as that same dpi and `Xft/DPI` as `96 × factor × window scale`. The KDE portal backend does not publish `text-scaling-factor`. Tauri's `scaleFactor()` is the monitor scale, the other control. [GSCHEMA] [PORTAL] [GPORTAL] [GTK4] [GTK3] [GSD] [TAURI]
- **Contrast theme.** The standardized portal value is `org.freedesktop.appearance` `contrast`, a `u`: `0` no preference, `1` higher contrast. The GNOME backend maps `org.gnome.desktop.a11y.interface` `high-contrast` onto it. The KDE backend does not implement the key, so `ReadOne` fails. The call is D-Bus, so it is the same on Wayland and X11, and it only answers when the desktop's portal backend implements the key. GTK 4 on Wayland copies the portal value into `gtk-interface-contrast`. GTK on X11 reads an XSETTINGS manager instead; GNOME's manager does not publish `contrast`, and publishes `Net/ThemeName` as `HighContrast` while high contrast is on. WebKitGTK 2.54.2's `forced-colors` media feature evaluates to `none`. With the GTK 3 WebKit that wry links, `prefers-contrast: more` follows a theme name of `HighContrast` or `HighContrastInverse`. [PORTAL] [GPORTAL] [KPORTAL] [GTK4] [GSD] [WEBKIT] [MQ5]
- **Reduced motion.** The standardized portal value is `org.freedesktop.appearance` `reduced-motion`, a `u`: `0` no preference, `1` reduced motion. GNOME maps `org.gnome.desktop.a11y.interface` `reduced-motion` (`no-preference` or `reduce`), a different key from `enable-animations`. KDE maps `~/.config/kdeglobals` group `KDE`, key `AnimationDurationFactor`: `0` becomes reduced motion, any other value, including a missing key, does not. Same D-Bus call on Wayland and X11, and the same dependence on the backend. GTK 4 on Wayland copies the portal value into `gtk-interface-reduced-motion`. The GTK 3 WebKit that wry 0.57 links sets `prefers-reduced-motion: reduce` when `gtk-enable-animations` is false. GNOME fills that animations flag from `enable-animations` and, when the shell answers, from gnome-shell's `AnimationsEnabled`, on both display servers. [PORTAL] [GPORTAL] [KPORTAL] [GSCHEMA] [GTK4] [GTK3] [GSD] [WEBKIT]

Tauri 2's window API, on Linux, returns a light/dark theme and a monitor scale factor. In tao 0.37.1 the theme is the portal's `color-scheme` key. That key is the light/dark preference. The four Windows settings above are not values that API returns. [TAURI] [TAO]

## What Arden Code reads on Windows

The four settings are honored in two places. Rust reads the regional format and the text size. The web engine supplies the contrast theme and reduced motion, and the page reads only the motion query.

**Regional format.** `arden_windows::preferences` reads `LocaleName` under `HKEY_CURRENT_USER\Control Panel\International`. If that value is missing, it calls `GetUserDefaultLocaleName`. A string that is not a language tag becomes `en-US`. The UI passes the tag to `Intl`, unless General → Regional format is set to English (US). [CODE] Microsoft documents `GetUserDefaultLocaleName` as the user default locale name. A thread in a user process is given that user default locale, `LOCALE_USER_DEFAULT`, which the person selects in the regional options. [WINLOC] [WINNLS] The watcher listens on that International key and on the text-size key. [CODE]

**Text size.** The same Rust module reads the DWORD `TextScaleFactor` under `HKEY_CURRENT_USER\Software\Microsoft\Accessibility`. A missing value means 100. The stored number is clamped to 100–225. Appearance → "Follow Windows text size" multiplies it into the interface scale. [CODE] Microsoft's `UISettings.TextScaleFactor` is this setting, a double from 1 to 2.25, and the Settings page is Accessibility → Text size. Text size and display scale are separate controls: Text size enlarges text, and System → Display → Scale enlarges text, icons, and apps together. [WINTEXT] [WINBIG]

**Contrast theme.** The app has no Windows API call and no `forced-colors` CSS. `tokens.css` is checked to contain no `forced-colors` rules. ADR 0056 leaves a contrast theme to the web engine's own forced colors. [CODE] [ADR] On Windows 11 the setting is Settings → Accessibility → Contrast themes; Windows 11 handles the older high contrast mode through those themes. The themes name colors for background, text, hyperlinks, inactive text, selected text, and button text. [WINCONTRAST] WebView2 is Edge's engine. Edge's forced-colors mode is the Windows high contrast feature: `forced-colors: active` means the engine is enforcing that palette, and the system color keywords carry it. [EDGE] Chromium reads it with `SystemParametersInfo(SPI_GETHIGHCONTRAST)` and treats `HCF_HIGHCONTRASTON` as forced colors active. Microsoft describes that flag as the HighContrast accessibility feature. [CHROMIUM] [SPI]

**Reduced motion.** The page calls `window.matchMedia("(prefers-reduced-motion: reduce)")`. The Appearance setting `reduceMotion` is `system` by default, which means follow that result; `on` and `off` override it. The setting's comment and the settings copy call the Windows value "Show animations". [CODE] Windows 11's control is Settings → Accessibility → Visual effects → Animation effects. Windows 10's is Settings → Ease of Access → Display → Show animations in Windows. [WINMOTION] Chromium's Windows implementation of `UpdatePrefersReducedMotion` calls `SystemParametersInfo(SPI_GETCLIENTAREAANIMATION)` and sets reduced motion when the returned animations flag is false. Microsoft describes that flag as whether animations are enabled. Blink's `prefers-reduced-motion` feature reads the frame setting `GetPrefersReducedMotion`. [CHROMIUM] [SPI] [MQ5]

Off Windows, `preferences::read` returns text scale 100 and locale `en-US`. The media queries stay in the page, so on Linux they ask WebKitGTK rather than WebView2. [CODE]

## Where a desktop tells an app

Four channels show up in the sources. They are not interchangeable, and Wayland and X11 do not share all of them.

**The Settings portal** is the freedesktop interface for a small set of host settings, "similar to XSettings". An app calls `org.freedesktop.portal.Settings` on the session bus, destination `org.freedesktop.portal.Desktop`, path `/org/freedesktop/portal/desktop`. `ReadOne(namespace, key)` was added in version 2 of the interface and returns one D-Bus value, or an error when the namespace or key is unknown. `Read` is deprecated because it wraps the value in an extra variant. `SettingChanged` fires when a value changes. `ReadAll` can take a trailing glob such as `org.gnome.*`. [PORTAL]

The standardized keys, all under `org.freedesktop.appearance`, are:

| Key | Type | Values |
| --- | --- | --- |
| `color-scheme` | `u` | `0` no preference, `1` prefer dark, `2` prefer light |
| `accent-color` | `(ddd)` | sRGB components in `[0, 1]` |
| `contrast` | `u` | `0` no preference, `1` higher contrast |
| `reduced-motion` | `u` | `0` no preference, `1` reduced motion |

An unknown numeric value is treated as `0`. Keys a backend adds beyond this list are implementation details, and the spec says they are undocumented. `color-scheme` is the light/dark preference. It is a different key from `contrast`. [PORTAL]

xdg-desktop-portal is the frontend. A desktop-specific backend supplies the values. `portals.conf` chooses the backend from `XDG_CURRENT_DESKTOP`: a desktop ships `/usr/share/xdg-desktop-portal/DESKTOP-portals.conf`, and a user file can override it. The app calls the frontend. It does not name the backend, and it does not choose Wayland or X11 in that call. The bus call is the same on both. A key the configured backend does not implement comes back as an error from `ReadOne`. [PORTALREADME] [PORTALSCONF]

**GSettings** is GNOME's store. The schemas below live in gsettings-desktop-schemas. Reading them uses the GSettings API and the installed schema. That read does not go through the display server, so the same keys are readable in a Wayland session and an X11 session when the schemas are installed. The GNOME portal backend is what republishes a subset of them. [GSCHEMA] [GPORTAL]

**XSETTINGS** is the X11 channel. GTK 3's documentation says that on X11 a shared setting comes from an XSETTINGS manager, and from `settings.ini` when there is no manager. GTK 4's documentation says the same for X11, and says that on Wayland the settings come from the settings portal. GNOME's manager is gnome-settings-daemon's xsettings plugin. It is X11 code: it includes `X11/Xatom.h`, and on XWayland it still serves X11 clients. A native Wayland window does not read those X properties. [GTK3DOC] [GTK4] [GSD]

**The locale environment** is independent of the display server. libc, via `setlocale` with an empty string, resolves each category from `LC_ALL`, then that category's variable, then `LANG`. [LOCALE]

## Regional format

Windows keeps one user locale for formatting. Linux splits that job by category. `LC_TIME` governs date and time, through `strftime`. `LC_NUMERIC` governs non-monetary numbers, through `printf`, `strtod`, and `localeconv`. `LC_MONETARY` governs currency. A process can therefore have German dates and English numbers at the same time. `LC_MESSAGES` is the language of messages, which is the other Windows choice, the display language, rather than the regional format. [LOCALE]

`/etc/locale.conf` holds the system-wide assignments, including `LANG`, `LC_TIME`, `LC_NUMERIC`, and `LC_MONETARY`. systemd reads it at early boot. Every service and user inherits it unless something overrides it. `LC_ALL` cannot be set in that file. `localectl` writes the file. Kernel arguments of the form `locale.LC_TIME=` override it for that boot. [LOCALECONF]

GNOME's schema `org.gnome.system.locale`, key `region`, is a string, default empty. The schema summary is "The locale to use for dates / numbers formats." The GNOME portal backend's schema list does not include `org.gnome.system.locale`, so this key is not one of the values that backend's `Read` serves. [GSCHEMA] [GPORTAL]

AccountService's user object exposes `Language`, "the user's main language, as a locale specification like `de_DE.UTF-8`," and `Languages` for further preferred languages. The interface read on 2026-10-25 has no formats-locale property. [ACCOUNTS]

KDE's Region and Language page can set a locale for Numbers, Time, Currency, and Measurement Units separately from the language list. The handbook says the configuration file is still `~/.config/plasma-localerc`. Plasma 5.27.11's session startup reads the `Formats` group of that file and, for each non-empty entry, puts `LANG` and the `LC_*` variables into the environment, including `LC_NUMERIC`, `LC_TIME`, and `LC_MONETARY`. [KDEDOC] [KDESTART]

The portal's standardized keys do not include a locale. An app reads the environment it was started with, or the desktop's own file or GSettings key. Changing the desktop setting does not by itself rewrite the environment of a process that is already running; libc resolves the categories from that environment when `setlocale` is called. [PORTAL] [LOCALE]

Wayland and X11 do not differ here. The display server is not the source.

## Text size

GNOME stores the text size as `text-scaling-factor` in `org.gnome.desktop.interface`. The type is `d`, the range is 0.5 to 3.0, and the default is 1.0. The description says it enlarges or reduces text display without changing the font size. The same schema's `scaling-factor` is a `u`, default 0, and is "an integer factor used to scale windows by" for high-dpi screens; 0 means choose from the monitor. `font-name` is a separate string, default `Adwaita Sans 11`, and carries a point size inside the font name. [GSCHEMA]

The GNOME portal backend loads `org.gnome.desktop.interface` and, for a key it does not special-case, returns `g_settings_get_value`. `text-scaling-factor` is such a key, so `Read("org.gnome.desktop.interface", "text-scaling-factor")` returns that double when this backend is the one `portals.conf` selected. The Settings portal spec does not list the key. It says keys outside the standardized list are implementation details. The KDE backend's appearance module handles `color-scheme`, `accent-color`, and `reduced-motion`. It has no `text-scaling-factor` key. [GPORTAL] [PORTAL] [KPORTAL]

GTK's Wayland backend, in both GTK 3.24 and GTK 4, asks the portal for settings and, when the GNOME key arrives, stores the factor as a 16.16 fixed point and sets the Xft-style dpi to `96 × factor × 1024`. The window scale is not part of that product. If the portal has no settings, GTK 4 falls back to its defaults. GTK 3 falls back to reading the GSettings schemas directly, including `text-scaling-factor`, when those schemas are installed. [GTK4] [GTK3]

On X11, GNOME's xsettings plugin computes the dpi as `96 × text-scaling-factor`. It then publishes three related XSETTINGS integers: `Gdk/WindowScalingFactor` is the window scale, `Gdk/UnscaledDPI` is `96 × text-scaling-factor × 1024`, and `Xft/DPI` is `96 × text-scaling-factor × window scale × 1024`. The comment in that plugin says the dpi is hard-coded from 96 rather than taken from the monitor's EDID size, so that two monitors do not get two text sizes. An X11 GTK application that reads only `Xft/DPI` is reading text scale and window scale together. A Wayland GTK application that reads `gtk-xft-dpi` from the path above is reading the text factor alone. [GSD] [GTK4] [GTK3]

Tauri's `scaleFactor()` is documented as the scale factor that maps physical pixels to logical pixels, and it changes when the display scale changes or the window moves to another display. That is the monitor scale. It is the Windows "Scale" control, not `TextScaleFactor`. [TAURI] [WINBIG]

## Contrast theme

The portal key `org.freedesktop.appearance` `contrast` is a preference for higher contrast: `0` or `1`. It is not a palette of background, text, and button colors. CSS keeps those ideas apart. `prefers-contrast` is `no-preference`, `less`, `more`, or `custom`. `forced-colors: active` means the engine enforces a limited user-chosen palette and exposes it as the system color keywords. The Media Queries draft says forced colors is not by itself a preference for more contrast. [PORTAL] [MQ5]

**GNOME.** `org.gnome.desktop.a11y.interface` `high-contrast` is a boolean, default false, "whether to use the high contrast style." The portal backend maps true to contrast `1` and false to `0`, and emits `SettingChanged` for `org.freedesktop.appearance` `contrast` when the boolean changes. While the boolean is true, the same backend reports `gtk-theme` as the string `HighContrast`. If the installed schema has no `high-contrast` key, the backend reports contrast `0`. [GSCHEMA] [GPORTAL]

**KDE.** `settings.cpp` in xdg-desktop-portal-kde handles `color-scheme` from the Qt palette, `accent-color` from the palette's highlight, and `reduced-motion`. A read of `contrast` finds no key and returns a D-Bus error that the property does not exist. The backend does republish the groups of `kdeglobals`, including the `ColorScheme` string under `org.kde.kdeglobals.General` when the palette changes. That string is the name of the color scheme. The portal spec does not define it as the contrast key. [KPORTAL] [PORTAL]

**Wayland.** GTK 4's Wayland settings table maps `org.freedesktop.appearance` `contrast` to `gtk-interface-contrast`. The property exists since GTK 4.20. Its enum is `UNSUPPORTED` (0), `NO_PREFERENCE` (1), `MORE` (2), `LESS` (3). The Wayland code stores `portal value + 1`, so the spec's `0` becomes `NO_PREFERENCE` and `1` becomes `MORE`. GTK 4's class documentation says Wayland settings come from the portal. GTK 3's Wayland code requests only `org.gnome.*` from the portal. It has no `gtk-interface-contrast` property. When high contrast is on, GNOME's portal makes `gtk-theme` read back as `HighContrast`; when GTK 3 is not using the portal, it reads the `high-contrast` boolean itself and uses that same theme name. [GTK4] [GTK3]

**X11.** GTK reads the XSETTINGS manager. GNOME's manager, on a high-contrast change, rewrites `Net/ThemeName` to `HighContrast` and otherwise writes the `gtk-theme` string. Its translation table has no `contrast` integer and no `gtk-interface-contrast`. `Gtk/EnableAnimations` is published; the contrast portal key is not. GTK 4 on X11 therefore does not get `gtk-interface-contrast` from this manager. The theme name is what this manager does publish. [GTK3DOC] [GTK4] [GSD]

**The web engine.** WebKitGTK 2.54.2 evaluates the `forced-colors` media feature to `none`. The evaluator does not consult the theme or the portal. `prefers-contrast` does consult the platform theme, and the values are `no-preference`, `more`, and `less`. [WEBKIT] [MQ5]

In that same 2.54.2 source, the GTK port branches on the GTK version it was built against:

- GTK 4.20 or newer reads `gtk-interface-contrast` and maps `MORE` and `LESS` to the CSS values.
- Older GTK, including GTK 3, returns more contrast when the theme name is `HighContrast` or `HighContrastInverse`, and no preference otherwise.

wry 0.57.0 and 0.57.1 depend on the `gtk` crate 0.18 and `webkit2gtk` 2.0.2, which are the GTK 3 bindings. The WebKit they load is WebKitGTK's GTK 3 library. In a 2.54.2 build of that library, the page's `prefers-contrast: more` follows the `HighContrast` theme name. `forced-colors: active` does not become true from that theme. A GTK 4 build of the same WebKit source, which this wry does not link, would follow `gtk-interface-contrast` instead. [WRY] [WEBKIT]

What the page can observe still depends on the WebKitGTK the distribution installed. The `prefers-contrast` path above is the 2.54.2 source. The portal key itself is readable with a D-Bus call whether or not WebKit is new enough to reflect it.

## Reduced motion

The portal key `org.freedesktop.appearance` `reduced-motion` is `0` or `1`. CSS `prefers-reduced-motion` is `no-preference` or `reduce`. The draft's `reduce` value means the person wants non-essential motion removed or replaced. [PORTAL] [MQ5]

**GNOME** has two booleans' worth of history, and they are different keys.

`org.gnome.desktop.interface` `enable-animations` is a boolean, default true. The description says it is global and changes the window manager, the panel, and so on. The portal backend still publishes this key. When gnome-shell's introspect object reports `AnimationsEnabled`, the backend publishes that shell value under `enable-animations` instead of the GSettings boolean. [GSCHEMA] [GPORTAL]

`org.gnome.desktop.a11y.interface` `reduced-motion` is the accessibility setting added in gsettings-desktop-schemas 50.alpha. The enum is `no-preference` (default) and `reduce`. GNOME 50's release notes put a Reduced Motion option in the Seeing section of Accessibility settings. The portal backend maps `reduce` to `1` and anything else, including a schema that lacks the key, to `0`. It emits `SettingChanged` on `org.freedesktop.appearance` `reduced-motion` when the enum changes. It does not derive this value from `enable-animations`. [GSCHEMA] [GNOME50] [GPORTAL]

**KDE.** The portal reads `AnimationDurationFactor` from the `KDE` group of `kdeglobals`, with a default of `1.0` when the key is absent. The published reduced-motion value is `1` only when that number is exactly `0`. A factor such as `0.5` stays `0`. The backend emits `SettingChanged` when that key changes. [KPORTAL]

**Wayland.** GTK 4 maps the portal key onto `gtk-interface-reduced-motion`, a property since GTK 4.22. The enum is `NO_PREFERENCE` (0) and `REDUCE` (1), and the Wayland code stores the portal `u` as that enum, without adding one. GTK 4 also still maps `org.gnome.desktop.interface` `enable-animations` to `gtk-enable-animations` when the GNOME backend supplies it. GTK 3's Wayland portal request is only `org.gnome.*`, so it receives `enable-animations` from the GNOME backend and does not request `org.freedesktop.appearance` `reduced-motion`. Its `gtk-enable-animations` property is the value WebKit GTK 3 reads. [GTK4] [GTK3]

**X11.** GNOME's XSETTINGS manager publishes `Gtk/EnableAnimations` from gnome-shell's `AnimationsEnabled` when that call succeeds. Its translation table does not publish `reduced-motion` or `gtk-interface-reduced-motion`. The X11 channel therefore carries the animations flag, and the a11y reduced-motion value stays on the portal and in GSettings. [GSD]

**The web engine.** WebKitGTK 2.41.4 added `prefers-reduced-motion` and connected it to `gtk-enable-animations`. In 2.54.2 the GTK port still does that when built against GTK older than 4.22: reduced motion is `gtk-enable-animations` being false. Built against GTK 4.22 or newer, it reads `gtk-interface-reduced-motion` and matches `REDUCE`. The CSS feature then reports `reduce` or `no-preference`. [WEBKITNEWS] [WEBKIT]

wry 0.57 links the GTK 3 WebKit. On that build, the page's `prefers-reduced-motion: reduce` follows `gtk-enable-animations` being false. On GNOME, that flag is the `enable-animations` / shell animations value, on Wayland through the portal or GSettings, and on X11 through `Gtk/EnableAnimations`. It is not the `reduced-motion` enum. An app that calls `ReadOne` for `org.freedesktop.appearance` `reduced-motion` is reading the a11y value on GNOME, and `AnimationDurationFactor == 0` on KDE, on either display server, provided that desktop's backend is the one configured. [WRY] [WEBKIT] [GPORTAL] [KPORTAL] [PORTALSCONF]

## What Tauri 2 and wry expose

This tree locks tauri 2.12.0, wry 0.57.0, and tao 0.37.1. wry's Linux webview is `webkit2gtk` 2.0.2 with the `gtk` 0.18 crate. wry 0.57.1, released 2026-10-23, depends on those same crate versions. Those crates are GTK 3 and WebKitGTK's GTK 3 API. The public window API documented for Tauri 2 returns two system numbers on Linux. [WRY] [TAURI]

`theme()` returns `light` or `dark`. tao 0.37.1 reads it, when no theme was forced on the window, by calling the deprecated portal `Read` for `org.freedesktop.appearance` `color-scheme` and unwrapping the extra variant. Portal `1` becomes dark, portal `2` becomes light, and any other value, including the spec's `0` for no preference, becomes light. If the call fails, `theme()` returns light. `SettingChanged` for that same key updates it. `setTheme` is app-wide on Linux. This is the light/dark preference, the portal's `color-scheme` key. [TAO] [PORTAL] [TAURI]

`scaleFactor()` returns the monitor scale factor, in physical pixels per logical pixel. [TAURI]

The regional format, the text-scaling factor, `contrast`, and `reduced-motion` are not results of those methods. A Tauri process can still call the portal on the session bus, read GSettings where the schemas are installed, and read the locale environment. The page's `matchMedia` calls see whatever WebKitGTK the process loaded, which for this wry is the GTK 3 behavior in the WebKit section above. [PORTAL] [WRY] [WEBKIT]

## Sources

- [CODE] Arden Code at `0ee2141`: `crates/arden-windows/src/preferences.rs`, `crates/arden-settings/src/settings.rs` (`ReduceMotion`), `apps/desktop/src/lib/appearance.ts`, `apps/desktop/src/styles/tokens.test.ts`, `apps/desktop/src/i18n/locales/en-US.json`, `docs/adr/0023-zoom-and-the-root-size.md`, `docs/adr/0056-the-stock-theme-and-a-lighter-accessibility-bar.md`, `docs/PLAN.md` section 10.
- [ADR] ADR 0056, accepted 2026-10-15, in this tree.
- [WINNLS] `GetUserDefaultLocaleName`, <https://learn.microsoft.com/en-us/windows/win32/api/winnls/nf-winnls-getuserdefaultlocalename>.
- [WINLOC] Locales and Languages, <https://learn.microsoft.com/en-us/windows/win32/intl/locales-and-languages>.
- [WINTEXT] `UISettings.TextScaleFactor`, <https://learn.microsoft.com/en-us/uwp/api/windows.ui.viewmanagement.uisettings.textscalefactor>. Make text and apps bigger, <https://support.microsoft.com/en-us/accessibility/windows/make-text-and-apps-bigger>.
- [WINBIG] Appendix D: Set up your device for screen comfort, Text size and Scale, <https://support.microsoft.com/en-au/accessibility/windows/magnifier/appendix-d-set-up-your-device-for-screen-comfort>.
- [WINCONTRAST] Change color contrast in Windows, <https://support.microsoft.com/en-us/accessibility/windows/change-color-contrast-in-windows>. Turn high contrast mode on or off in Windows, <https://support.microsoft.com/en-us/windows/turn-high-contrast-mode-on-or-off-in-windows-909e9d89-a0f9-a3a9-b993-7a6dcee85025>.
- [WINMOTION] Make it easier to focus on tasks, <https://support.microsoft.com/en-us/accessibility/windows/make-it-easier-to-focus-on-tasks>.
- [EDGE] Styling for Windows high contrast with new standards for forced colors, Microsoft Edge Blog, 17 September 2020, <https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/>.
- [SPI] `SystemParametersInfoW`, `SPI_GETCLIENTAREAANIMATION` and `SPI_GETHIGHCONTRAST`, <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow>.
- [CHROMIUM] Chromium `main` on 2026-10-25: `ui/gfx/animation/animation_win.cc` (`UpdatePrefersReducedMotion`), `ui/native_theme/os_settings_provider_win.cc` (`IsSystemForcedColorsActive`), `ui/native_theme/native_theme.cc` (`CalculateForcedColors`), `third_party/blink/renderer/core/css/media_values.cc` (`CalculatePrefersReducedMotion`, `CalculateForcedColors`).
- [MQ5] Media Queries Level 5, W3C Working Draft, 19 February 2026, sections 12.1, 12.3, and 12.4, <https://www.w3.org/TR/mediaqueries-5/>.
- [PORTAL] `org.freedesktop.portal.Settings`, interface documentation and `data/org.freedesktop.portal.Settings.xml` at `49075617`, <https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html>. `contrast` was added in `7605cb67` (2024-01-25). `reduced-motion` was added in `005f8fc7` (2025-11-06).
- [PORTALREADME] xdg-desktop-portal `README.md` at `49075617`.
- [PORTALSCONF] `doc/portals.conf.rst.in` at `49075617`.
- [GSCHEMA] gsettings-desktop-schemas `main` at `368be612`: `schemas/org.gnome.desktop.interface.gschema.xml.in`, `schemas/org.gnome.desktop.a11y.interface.gschema.xml.in`, `schemas/org.gnome.system.locale.gschema.xml.in`, `headers/gdesktop-enums.h`, `NEWS` (reduced motion in 50.alpha).
- [GNOME50] Introducing GNOME 50, <https://release.gnome.org/50/>.
- [GPORTAL] xdg-desktop-portal-gnome `src/settings.c` at `f613aa2c`.
- [KPORTAL] xdg-desktop-portal-kde `src/settings.cpp` at `936476a5`.
- [GTK4] GTK `main` at `c36202f6`: `gtk/gtksettings.c`, `gdk/wayland/gdksettings-wayland.c`, and the settings class documentation, <https://docs.gtk.org/gtk4/class.Settings.html>, <https://docs.gtk.org/gtk4/enum.InterfaceContrast.html>, <https://docs.gtk.org/gtk4/enum.ReducedMotion.html>.
- [GTK3] GTK `gtk-3-24` at `0f3aa454`: `gdk/wayland/gdkscreen-wayland.c`. Class documentation, <https://docs.gtk.org/gtk3/class.Settings.html>.
- [GTK3DOC] The GTK 3 `GtkSettings` description cited above.
- [GSD] gnome-settings-daemon `plugins/xsettings/gsd-xsettings-manager.c` at `d3e71700`.
- [WEBKIT] WebKitGTK 2.54.2 (tag date 2026-10-23): `Source/WebKit/UIProcess/gtk/SystemSettingsManagerProxyGtk.cpp`, `Source/WebCore/platform/adwaita/ThemeAdwaita.cpp`, `Source/WebCore/css/query/MediaQueryFeatures.cpp`. The reduced-motion and contrast branch for GTK 4 landed in `fc83508a` (2026-07-07), and that commit is contained in the 2.54.2 tag.
- [WEBKITNEWS] WebKitGTK 2.41.4 release notes, "Add support for prefers-reduced-motion media query," and commit `4fbff322` (2023-05-07), which connects the feature to `gtk-enable-animations`.
- [LOCALE] `locale(7)`, Linux man-pages, <https://man7.org/linux/man-pages/man7/locale.7.html>.
- [LOCALECONF] `locale.conf`, <https://www.freedesktop.org/software/systemd/man/latest/locale.conf.html>.
- [ACCOUNTS] `org.freedesktop.Accounts.User` in accountsservice `main`, property `Language`, read 2026-10-25, <https://gitlab.freedesktop.org/accountsservice/accountsservice/-/raw/main/data/org.freedesktop.Accounts.User.xml>.
- [KDEDOC] Region and Language, KDE docs for Plasma KF6, <https://docs.kde.org/stable_kf6/en/plasma-workspace/kcontrol/region_language/index.html>.
- [KDESTART] plasma-workspace commit `a29530af`, "Handle previously ignored LC_* values," fixed in Plasma 5.27.11, <https://invent.kde.org/plasma/plasma-workspace/-/commit/a29530af6cdc2c9c06f455823b2f95b81608774c>.
- [TAURI] Tauri 2 window API, `theme()` and `scaleFactor()`, <https://v2.tauri.app/reference/javascript/api/namespacewindow/>, read 2026-10-25.
- [TAO] tao 0.37.1, `src/platform_impl/linux/portal.rs` and `window.rs`, tag `tao-v0.37.1`.
- [WRY] wry 0.57.0 `Cargo.toml`, tag `wry-v0.57.0`, and the same `gtk` 0.18 and `webkit2gtk` 2.0.2 dependencies in wry 0.57.1.
