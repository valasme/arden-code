//! Commands the UI can call that belong to no other area: the app and the system it runs on, its
//! window, links and pages. Each one returns a typed `AppError` on failure (ADR 0008).

use crate::{notifications, restart};
use arden_core::AppInfo;
use arden_core::error::{AppError, ErrorCode};
use arden_core::links;
use arden_core::paths::AppPaths;
use arden_core::reset;
use arden_settings::service::SettingsService;
use arden_windows::preferences;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
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

/// What the About page shows besides the app's own version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SystemInfo {
    /// The Windows version, such as `Windows 11 24H2 (build 26100.1234)`.
    pub windows: String,
    /// The version of the web engine (`WebView2`) that draws the window.
    pub webview: String,
}

/// The Windows and `WebView2` versions.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008), even one that cannot fail yet.
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn get_system_info() -> Result<SystemInfo, AppError> {
    Ok(SystemInfo {
        windows: preferences::windows_version(),
        webview: tauri::webview_version().unwrap_or_else(|_| "unknown".to_owned()),
    })
}

/// What is known about this build and this computer, as text for a bug report. It holds nothing
/// about the person.
pub(crate) fn system_info_text() -> String {
    let app = arden_core::app_info();
    format!(
        "{} {}\nBuild: {} ({})\nWindows: {}\nWebView2: {}",
        app.name,
        app.version,
        app.commit,
        app.build_date,
        preferences::windows_version(),
        tauri::webview_version().unwrap_or_else(|_| "unknown".to_owned()),
    )
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

/// The pages of the project that the app can open in the browser. Each one is a fixed address, so
/// nothing the UI is given can send the browser somewhere else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProjectPage {
    /// The release notes.
    Releases,
    /// The privacy statement.
    Privacy,
}

impl ProjectPage {
    /// The address of the page.
    #[must_use]
    pub const fn url(self) -> &'static str {
        match self {
            Self::Releases => concat!(env!("CARGO_PKG_REPOSITORY"), "/releases"),
            Self::Privacy => concat!(env!("CARGO_PKG_REPOSITORY"), "/blob/main/PRIVACY.md"),
        }
    }
}

/// Opens a page of the project in the default browser.
///
/// # Errors
///
/// `ARD-APP-001` when Windows cannot open the browser.
// Tauri hands commands their app handle by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn open_project_page(app: AppHandle, page: ProjectPage) -> Result<(), AppError> {
    app.opener()
        .open_url(page.url(), None::<&str>)
        .map_err(|error| AppError::new(ErrorCode::Unexpected).with_details(error.to_string()))
}

/// Shows a notification so the person can see how it looks, unless notifications are off. Says
/// whether one was shown.
///
/// # Errors
///
/// Returns `ARD-APP-005` when Windows would not show it.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn send_test_notification(
    app: AppHandle,
    settings: State<'_, SettingsService>,
) -> Result<bool, AppError> {
    let enabled = settings.get().notifications.desktop;
    let (title, body) = (
        arden_core::APP_NAME,
        "This is a test notification. Arden Code will use notifications like this to tell you when an agent needs you.",
    );
    #[cfg(debug_assertions)]
    let shown = match std::env::var_os(notifications::FILE_VARIABLE) {
        Some(file) => notifications::send(enabled, &notifications::File(file.into()), title, body),
        None => notifications::send(enabled, &notifications::Windows(&app), title, body),
    };
    #[cfg(not(debug_assertions))]
    let shown = notifications::send(enabled, &notifications::Windows(&app), title, body);
    shown.map_err(|error| AppError::new(ErrorCode::NotificationNotShown).with_details(error))
}

/// Opens a link from an agent's reply in the program Windows uses for it. A web address opens
/// straight away; other kinds only when `confirmed` says the person agreed; some never (see
/// `arden_core::links`). The decision is made here, whatever the page asked for.
///
/// # Errors
///
/// Returns `ARD-APP-004` when the link is not allowed or cannot be opened.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn open_link(app: AppHandle, url: String, confirmed: bool) -> Result<(), AppError> {
    let url = url.trim();
    let allowed = match links::classify(url) {
        links::LinkKind::Open => true,
        links::LinkKind::Confirm => confirmed,
        links::LinkKind::Blocked => false,
    };
    if !allowed {
        tracing::warn!("a link was not opened because its kind is not allowed");
        return Err(AppError::new(ErrorCode::LinkNotOpened));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| AppError::new(ErrorCode::LinkNotOpened).with_details(error.to_string()))
}

/// The kinds of file the person is asked for.
#[derive(Clone, Copy)]
pub(crate) enum FileKind {
    SettingsToSave,
    SettingsToOpen,
    DiagnosticsToSave,
}

/// Asks the person for a file. A debug build can be told the answer, so tests need no dialog.
pub(crate) async fn choose_file(app: &AppHandle, kind: FileKind) -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(answer) = std::env::var_os("ARDEN_CODE_FILE_DIALOG_ANSWER") {
        return Some(PathBuf::from(answer));
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file();
        let chosen = match kind {
            FileKind::SettingsToSave => dialog
                .add_filter("Settings", &["json"])
                .set_file_name("arden-code-settings.json")
                .blocking_save_file(),
            FileKind::SettingsToOpen => dialog
                .add_filter("Settings", &["json"])
                .blocking_pick_file(),
            FileKind::DiagnosticsToSave => dialog
                .add_filter("Diagnostics", &["zip"])
                .set_file_name("arden-code-diagnostics.zip")
                .blocking_save_file(),
        };
        chosen.and_then(|path| path.into_path().ok())
    })
    .await
    .ok()
    .flatten()
}

/// Wipes the settings, sessions, logs, crash reports and caches, and starts the app again. The
/// wiping is done by the new start, once this one and its web engine have ended: the sessions, logs
/// and caches are in use until then.
///
/// # Errors
///
/// `ARD-APP-003` when the request cannot be written.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn reset_app(app: AppHandle, paths: State<'_, AppPaths>) -> Result<(), AppError> {
    reset::request(&paths)?;
    restart::request(&app);
    Ok(())
}

/// A reset that could not finish at this start, for the page to tell the person about once.
#[derive(Debug, Default)]
pub struct ResetNotice(Mutex<Option<AppError>>);

impl ResetNotice {
    /// The notice for the outcome of a reset that was asked for: one only when it could not finish.
    pub fn after(reset: &std::io::Result<bool>) -> Self {
        Self(Mutex::new(reset.as_ref().err().map(|error| {
            AppError::new(ErrorCode::ResetUnfinished).with_details(error.to_string())
        })))
    }
}

/// Says, once, that the reset the person asked for could not finish at this start.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn take_reset_notice(notice: State<'_, ResetNotice>) -> Result<Option<AppError>, AppError> {
    Ok(notice
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take())
}

/// Starts the app again, for a setting that needs it.
///
/// # Errors
///
/// Never fails: the app is on its way out.
// Tauri hands commands their app handle by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn restart_app(app: AppHandle) -> Result<(), AppError> {
    restart::request(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_project_page_is_on_the_projects_own_github_page() {
        for page in [ProjectPage::Releases, ProjectPage::Privacy] {
            assert!(
                page.url()
                    .starts_with("https://github.com/valasme/arden-code/"),
                "{}",
                page.url()
            );
        }
    }
}
