//! Commands the UI can call.

use arden_core::AppInfo;

/// The product name and version, for the window and the About page.
#[tauri::command]
#[specta::specta]
pub fn app_info() -> AppInfo {
    arden_core::app_info()
}

/// Opens the window's system menu (Restore, Move, Size, Minimize, Maximize, Close), like Alt+Space.
///
/// The title bar is drawn by the UI, so Windows' own menu has to be asked for.
// Tauri hands commands their window by value; there is no way to ask for a reference.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn show_system_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    let handle = window.hwnd().map_err(|error| error.to_string())?;
    arden_windows::system_menu::show(handle.0 as isize).map_err(|error| error.to_string())
}
