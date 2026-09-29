//! The main window's first moments: where it opens, no white flash, and never stuck hidden.

use std::time::Duration;

use arden_core::paths::AppPaths;
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
pub fn prepare_main_window(app: &tauri::App, paths: &AppPaths) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(tauri::Error::WindowNotFound)?;

    let (r, g, b, a) = startup_background(window.theme()? == Theme::Dark);
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
