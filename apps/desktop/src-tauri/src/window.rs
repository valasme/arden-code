//! The main window's first moments: where it opens, no white flash, and never stuck hidden.

use std::time::Duration;

use arden_core::paths::AppPaths;
use arden_settings::settings::Theme as ThemeSetting;
use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme};

use crate::window_state;

/// How long the UI has to show the window before Rust shows it anyway.
const SHOW_FALLBACK: Duration = Duration::from_secs(5);

/// The color behind the web page, as red, green, blue and alpha.
///
/// It must equal the theme's `--background` token (`tokens.css`), so the window is already the
/// right color before the UI has drawn anything. A contract test compares the two.
#[must_use]
pub fn startup_background(dark: bool) -> (u8, u8, u8, u8) {
    if dark {
        (10, 10, 10, 255)
    } else {
        (255, 255, 255, 255)
    }
}

/// Whether the window should start dark: the chosen theme, or Windows' own when it follows Windows.
#[must_use]
pub fn starts_dark(theme: ThemeSetting, windows_is_dark: bool) -> bool {
    match theme {
        ThemeSetting::Dark => true,
        ThemeSetting::Light => false,
        ThemeSetting::System => windows_is_dark,
    }
}

/// The theme to give the window itself, so that Windows' menus and title bar buttons match the app.
/// `None` follows Windows.
#[must_use]
pub fn native_theme(theme: ThemeSetting) -> Option<Theme> {
    match theme {
        ThemeSetting::System => None,
        ThemeSetting::Light => Some(Theme::Light),
        ThemeSetting::Dark => Some(Theme::Dark),
    }
}

/// Makes the window's own theme match the setting.
pub fn apply_native_theme(app: &AppHandle, theme: ThemeSetting) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(native_theme(theme));
    }
}

/// Puts the hidden main window where it was last time, paints it in the current Windows theme, and
/// makes sure it appears.
///
/// The window starts hidden (see `tauri.conf.json`). The UI shows it once its first themed frame is
/// drawn. If the UI never does, for example because it failed to load, this shows it after a few
/// seconds so the app is never invisible.
///
/// # Errors
///
/// Returns an error when the window cannot be found, placed or painted.
pub fn prepare_main_window(
    app: &tauri::App,
    paths: &AppPaths,
    theme: ThemeSetting,
) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(tauri::Error::WindowNotFound)?;

    // A debug build keeps the browser's menu and shortcuts, which developers use.
    #[cfg(not(debug_assertions))]
    crate::webview::harden(&window)?;

    window.set_theme(native_theme(theme))?;
    let (r, g, b, a) = startup_background(starts_dark(theme, window.theme()? == Theme::Dark));
    window.set_background_color(Some(Color(r, g, b, a)))?;

    let state_file = paths.window_state_file();
    let placement = window_state::restore_window(app.handle(), &window, &state_file)?;
    window_state::remember_window(&window, placement, &state_file);

    std::thread::spawn(move || {
        std::thread::sleep(SHOW_FALLBACK);
        // Showing a window that is already visible does nothing.
        let _ = window.show();
    });
    Ok(())
}

/// Brings the main window to the front, for when the app is launched a second time.
pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_window_starts_in_the_chosen_theme_or_in_windows_when_it_follows_windows() {
        assert!(starts_dark(ThemeSetting::Dark, false));
        assert!(!starts_dark(ThemeSetting::Light, true));
        assert!(starts_dark(ThemeSetting::System, true));
        assert!(!starts_dark(ThemeSetting::System, false));
    }

    #[test]
    fn the_window_itself_follows_windows_only_when_the_setting_does() {
        assert_eq!(native_theme(ThemeSetting::System), None);
        assert_eq!(native_theme(ThemeSetting::Light), Some(Theme::Light));
        assert_eq!(native_theme(ThemeSetting::Dark), Some(Theme::Dark));
    }
}
