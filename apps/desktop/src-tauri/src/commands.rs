//! Commands the UI can call.

use arden_core::AppInfo;

/// The product name and version, for the window and the About page.
#[tauri::command]
#[specta::specta]
pub fn app_info() -> AppInfo {
    arden_core::app_info()
}
