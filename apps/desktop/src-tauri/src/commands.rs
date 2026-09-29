//! Commands the UI can call. Each one returns a typed `AppError` on failure (ADR 0008).

use arden_core::AppInfo;
use arden_core::error::{AppError, ErrorCode};
use arden_core::paths::AppPaths;
use arden_diagnostics::logging::{self, UiLevel};
use arden_diagnostics::redact::Redactor;
use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

/// The product name and version, for the window and the About page.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command so the contract stays uniform.
// Every command returns a `Result` (ADR 0008), even one that cannot fail yet.
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn app_info() -> Result<AppInfo, AppError> {
    Ok(arden_core::app_info())
}

/// Opens the window's system menu (Restore, Move, Size, Minimize, Maximize, Close), like Alt+Space.
///
/// The title bar is drawn by the UI, so Windows' own menu has to be asked for.
///
/// # Errors
///
/// `ARD-WIN-001` when the window handle is missing or Windows refuses the request.
// Tauri hands commands their window by value; there is no way to ask for a reference.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn show_system_menu(window: tauri::WebviewWindow) -> Result<(), AppError> {
    let failed = |error: &dyn std::fmt::Display| {
        AppError::new(ErrorCode::WindowsSystemMenu).with_details(error.to_string())
    };
    let handle = window.hwnd().map_err(|error| failed(&error))?;
    arden_windows::system_menu::show(handle.0 as isize).map_err(|error| failed(&error))
}

/// How serious a message from the UI is.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum UiLogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

impl From<UiLogLevel> for UiLevel {
    fn from(level: UiLogLevel) -> Self {
        match level {
            UiLogLevel::Error => Self::Error,
            UiLogLevel::Warn => Self::Warn,
            UiLogLevel::Info => Self::Info,
            UiLogLevel::Debug => Self::Debug,
        }
    }
}

/// Records a message from the UI in the same log files as Rust's own.
// Tauri hands commands their arguments by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn log_from_ui(level: UiLogLevel, source: String, message: String, code: Option<String>) {
    logging::ui(level.into(), &source, &message, code.as_deref());
}

/// Removes private details (the user's folder, email addresses, secrets) from text the user is about
/// to share, using the same rules as the log files.
// Tauri hands commands their arguments and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn redact_text(text: String, redactor: State<'_, Redactor>) -> String {
    redactor.redact(&text)
}

/// Opens the folder that holds the log files in Explorer.
///
/// # Errors
///
/// `ARD-LOG-001` when the folder cannot be created or opened.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn open_logs_folder(app: AppHandle, paths: State<'_, AppPaths>) -> Result<(), AppError> {
    let failed = |error: &dyn std::fmt::Display| {
        AppError::new(ErrorCode::LogsFolder).with_details(error.to_string())
    };
    let folder = paths.logs_dir();
    std::fs::create_dir_all(&folder).map_err(|error| failed(&error))?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|error| failed(&error))
}

/// Fails on purpose, so tests and the development page can see what an error looks like. Debug
/// builds only.
///
/// # Errors
///
/// Always `ARD-APP-001`, with details that contain a user folder so redaction can be checked.
#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub fn debug_fail() -> Result<(), AppError> {
    Err(AppError::new(ErrorCode::Unexpected)
        .with_details(r"deliberate failure while reading C:\Users\Tester\notes.txt"))
}

/// Panics on purpose, so tests can check that a crash report is written. Debug builds only.
#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub fn debug_panic() {
    // A panic on a Tauri command thread is caught and reported by Tauri; this one is on its own
    // thread, like a real crash in background work.
    std::thread::spawn(|| panic!("deliberate panic for testing"));
}
