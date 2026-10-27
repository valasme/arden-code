//! The desktop's settings the UI follows on Linux (ADR 0061): the regional format and the text size.
//!
//! The regional format comes from the locale the session gave the app, as every Linux program reads
//! it. The text size comes from GTK's font resolution, which follows GNOME's text scaling on Wayland
//! and on X11, and the font resolution other desktops set. Reduced motion reaches the page through
//! the web engine itself, as it does on Windows; Windows' contrast themes have no Linux counterpart.

#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicU16, Ordering};

pub use arden_core::preferences::{
    FALLBACK_LOCALE, SystemPreferences, Watcher, normalize_locale, text_scale_percent,
};

/// The font resolution GTK uses when nothing changed it: 96 dots per inch.
const NORMAL_DPI: f64 = 96.0;

/// The text size from GTK's font resolution (`gtk-xft-dpi`), which counts dots per inch times 1024:
/// 96 dots per inch is the normal size. Nothing set (zero or less) means the normal size.
#[must_use]
pub fn text_scale_from_xft_dpi(xft_dpi: i32) -> u16 {
    if xft_dpi <= 0 {
        return text_scale_percent(None);
    }
    let percent = (f64::from(xft_dpi) / 1024.0 / NORMAL_DPI * 100.0).round();
    // The cast is safe: the value is a positive whole number, below 2^31 / 1024.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    text_scale_percent(Some(percent as u32))
}

/// The regional format, as a language tag, from the locale variables in the order the C library
/// reads them for dates and numbers: `LC_ALL`, `LC_TIME`, `LC_NUMERIC`, then `LANG`. A name such as
/// `en_GB.UTF-8` becomes `en-GB`; the `C` and `POSIX` locales name no region.
#[must_use]
pub fn locale_from_variables(read: impl Fn(&str) -> Option<String>) -> String {
    ["LC_ALL", "LC_TIME", "LC_NUMERIC", "LANG"]
        .into_iter()
        .filter_map(read)
        .map(|value| value.trim().to_owned())
        .find(|value| !value.is_empty())
        .map_or_else(|| FALLBACK_LOCALE.to_owned(), |value| language_tag(&value))
}

/// `language[_territory][.codeset][@modifier]` as a language tag.
fn language_tag(locale: &str) -> String {
    let name = locale.split(['.', '@']).next().unwrap_or_default();
    if name.eq_ignore_ascii_case("C") || name.eq_ignore_ascii_case("POSIX") {
        return FALLBACK_LOCALE.to_owned();
    }
    normalize_locale(&name.replace('_', "-"))
}

/// The text size last read from GTK. GTK can only be asked from the thread it runs on, and the
/// preferences are read from others too.
#[cfg(target_os = "linux")]
static TEXT_SCALE: AtomicU16 = AtomicU16::new(100);

/// Reads GTK's font resolution, when this is GTK's thread, and keeps it for the other threads.
#[cfg(target_os = "linux")]
fn text_scale() -> u16 {
    use gtk::prelude::GtkSettingsExt;

    if gtk::is_initialized_main_thread()
        && let Some(settings) = gtk::Settings::default()
    {
        TEXT_SCALE.store(
            text_scale_from_xft_dpi(settings.gtk_xft_dpi()),
            Ordering::Relaxed,
        );
    }
    TEXT_SCALE.load(Ordering::Relaxed)
}

#[cfg(not(target_os = "linux"))]
fn text_scale() -> u16 {
    text_scale_percent(None)
}

/// Reads the preferences from the desktop.
///
/// In debug builds, `ARDEN_CODE_SYSTEM_PREFERENCES_FILE` may name a JSON file that stands in for the
/// desktop, as on Windows. Release builds never look at it.
#[must_use]
pub fn read() -> SystemPreferences {
    #[cfg(debug_assertions)]
    if let Some(preferences) = arden_core::preferences::read_stand_in() {
        return preferences;
    }
    SystemPreferences {
        text_scale_percent: text_scale(),
        locale: locale_from_variables(|name| std::env::var(name).ok()),
    }
}

/// Why the desktop cannot be watched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotOnGtksThread;

impl std::fmt::Display for NotOnGtksThread {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("GTK is not running on this thread")
    }
}

impl std::error::Error for NotOnGtksThread {}

/// Calls `on_change` with the preferences when the person changes the text size, for as long as GTK
/// runs. Nothing runs in between: GTK says when its font resolution changes. `first` is what the
/// caller already knows; a change that leaves the preferences as they were is not reported. The
/// locale is the one the app was started with, so a new regional format is seen at the next start,
/// as by every Linux program.
///
/// # Errors
///
/// Returns an error when this is not the thread GTK runs on.
#[cfg(target_os = "linux")]
pub fn watch(
    first: SystemPreferences,
    on_change: impl Fn(&SystemPreferences) + 'static,
) -> Result<(), NotOnGtksThread> {
    use std::cell::RefCell;

    use gtk::prelude::GtkSettingsExt;

    if !gtk::is_initialized_main_thread() {
        return Err(NotOnGtksThread);
    }
    let settings = gtk::Settings::default().ok_or(NotOnGtksThread)?;
    let last = RefCell::new(first);
    // GTK keeps the handler for as long as it keeps its settings, which is as long as it runs.
    settings.connect_gtk_xft_dpi_notify(move |_| {
        let now = read();
        if *last.borrow() != now {
            on_change(&now);
            *last.borrow_mut() = now;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn variables(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn the_text_size_is_the_font_resolution_against_96_dots_per_inch() {
        assert_eq!(text_scale_from_xft_dpi(96 * 1024), 100);
        assert_eq!(text_scale_from_xft_dpi(120 * 1024), 125);
        assert_eq!(text_scale_from_xft_dpi(144 * 1024), 150);
        // GNOME's "Large Text" is a factor of 1.25; its dpi is not a whole number.
        assert_eq!(text_scale_from_xft_dpi(122_880), 125);
    }

    #[test]
    fn a_font_resolution_that_is_not_set_is_the_normal_size() {
        assert_eq!(text_scale_from_xft_dpi(-1), 100);
        assert_eq!(text_scale_from_xft_dpi(0), 100);
    }

    #[test]
    fn a_text_size_outside_what_the_interface_is_drawn_at_is_brought_inside() {
        // GNOME allows 0.5 to 3.0.
        assert_eq!(text_scale_from_xft_dpi(48 * 1024), 100);
        assert_eq!(text_scale_from_xft_dpi(288 * 1024), 225);
        assert_eq!(text_scale_from_xft_dpi(i32::MAX), 225);
    }

    #[test]
    fn the_regional_format_is_read_from_the_locale_the_session_gave() {
        assert_eq!(
            locale_from_variables(variables(&[("LANG", "el_GR.UTF-8")])),
            "el-GR"
        );
        assert_eq!(
            locale_from_variables(variables(&[
                ("LANG", "en_US.UTF-8"),
                ("LC_TIME", "en_GB.UTF-8")
            ])),
            "en-GB"
        );
        assert_eq!(
            locale_from_variables(variables(&[
                ("LC_TIME", "en_GB.UTF-8"),
                ("LC_ALL", "de_DE")
            ])),
            "de-DE"
        );
        assert_eq!(
            locale_from_variables(variables(&[
                ("LANG", "fr_CA.UTF-8"),
                ("LC_NUMERIC", "fr_FR")
            ])),
            "fr-FR"
        );
    }

    #[test]
    fn an_empty_variable_is_skipped() {
        assert_eq!(
            locale_from_variables(variables(&[("LC_ALL", ""), ("LANG", "pt_BR.UTF-8")])),
            "pt-BR"
        );
    }

    #[test]
    fn a_codeset_and_a_modifier_are_left_out() {
        assert_eq!(
            locale_from_variables(variables(&[("LANG", "de_DE@euro")])),
            "de-DE"
        );
        assert_eq!(
            locale_from_variables(variables(&[("LANG", "sr_RS.UTF-8@latin")])),
            "sr-RS"
        );
        assert_eq!(locale_from_variables(variables(&[("LANG", "ja")])), "ja");
    }

    #[test]
    fn the_c_locale_and_no_locale_mean_english_us() {
        for value in ["C", "C.UTF-8", "POSIX", "c", "not a locale"] {
            assert_eq!(
                locale_from_variables(variables(&[("LANG", value)])),
                "en-US",
                "{value}"
            );
        }
        assert_eq!(locale_from_variables(variables(&[])), "en-US");
    }

    #[test]
    fn the_preferences_read_are_ones_the_ui_can_use() {
        let preferences = read();

        assert_eq!(preferences.locale, normalize_locale(&preferences.locale));
        assert!((100..=225).contains(&preferences.text_scale_percent));
    }
}
