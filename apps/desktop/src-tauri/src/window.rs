//! The main window's first moments: no white flash, and never stuck hidden.

use std::time::Duration;

use tauri::window::Color;
use tauri::{Manager, Theme};

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

/// Paints the hidden main window in the current Windows theme, and makes sure it appears.
///
/// The window starts hidden (see `tauri.conf.json`). The UI shows it once its first themed frame is
/// drawn. If the UI never does, for example because it failed to load, this shows it after a few
/// seconds so the app is never invisible.
///
/// # Errors
///
/// Returns an error when the window cannot be found or painted.
pub fn prepare_main_window(app: &tauri::App) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(tauri::Error::WindowNotFound)?;

    let (r, g, b, a) = startup_background(window.theme()? == Theme::Dark);
    window.set_background_color(Some(Color(r, g, b, a)))?;

    std::thread::spawn(move || {
        std::thread::sleep(SHOW_FALLBACK);
        // Showing a window that is already visible does nothing.
        let _ = window.show();
    });
    Ok(())
}
