//! Commands the UI can call. Each one returns a typed `AppError` on failure (ADR 0008).

use crate::notifications;
use arden_core::AppInfo;
use arden_core::error::{AppError, ErrorCode};
use arden_core::links;
use arden_core::paths::AppPaths;
use arden_core::reset;
use arden_diagnostics::logging::{self, UiLevel};
use arden_diagnostics::redact::Redactor;
use arden_diagnostics::{bundle, crash, entries};
use arden_settings::service::SettingsService;
use arden_settings::settings::{SettingChange, SettingKey, Settings};
use arden_settings::store;
use arden_windows::preferences;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;
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

/// Sent to the UI whenever the settings change: through the UI, or by editing the file by hand.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct SettingsChanged {
    pub settings: Settings,
    /// Set when the file could not be used and the defaults took over (`ARD-SET-002`).
    pub notice: Option<AppError>,
}

/// The settings now.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn get_settings(settings: State<'_, SettingsService>) -> Result<Settings, AppError> {
    Ok(settings.get())
}

/// Changes one setting: applies it, saves it, and tells every window.
///
/// # Errors
///
/// `ARD-SET-001` when the settings file cannot be written.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn change_setting(
    change: SettingChange,
    settings: State<'_, SettingsService>,
) -> Result<Settings, AppError> {
    settings.update(change)
}

/// Puts one setting back to its default: saves it, and tells every window.
///
/// # Errors
///
/// `ARD-SET-001` when the settings file cannot be written.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn reset_setting(
    key: SettingKey,
    settings: State<'_, SettingsService>,
) -> Result<Settings, AppError> {
    settings.reset(key)
}

/// Changes the shortcuts of one command: saves them, and tells every window. An empty list leaves the
/// command without a shortcut.
///
/// # Errors
///
/// `ARD-SET-001` when the settings file cannot be written.
// Tauri hands commands their arguments and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn set_shortcuts(
    command: String,
    shortcuts: Vec<String>,
    settings: State<'_, SettingsService>,
) -> Result<Settings, AppError> {
    settings.set_shortcuts(&command, &shortcuts)
}

/// Gives one command, or every command when `command` is empty, its default shortcuts again.
///
/// # Errors
///
/// `ARD-SET-001` when the settings file cannot be written.
// Tauri hands commands their arguments and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn reset_shortcuts(
    command: Option<String>,
    settings: State<'_, SettingsService>,
) -> Result<Settings, AppError> {
    settings.reset_shortcuts(command.as_deref())
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

/// What is known about this build and this computer, as text for a bug report. It holds nothing
/// about the person.
fn system_info_text() -> String {
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

/// Writes text so that it can be part of an address: everything except letters, digits and `-_.~`
/// becomes `%` and two hex digits.
fn percent_encode(text: &str) -> String {
    use std::fmt::Write;

    text.bytes().fold(String::new(), |mut encoded, byte| {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(byte));
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
        encoded
    })
}

/// The address of a new bug report with the system information already filled in.
#[must_use]
pub fn bug_report_url(system_info: &str) -> String {
    format!(
        "{}/issues/new?template=bug_report.yml&system={}",
        env!("CARGO_PKG_REPOSITORY"),
        percent_encode(system_info)
    )
}

/// Opens a new bug report in the browser, with the system information filled in and nothing else:
/// no logs, no settings and no paths.
///
/// # Errors
///
/// `ARD-APP-001` when Windows cannot open the browser.
// Tauri hands commands their app handle by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn open_bug_report(app: AppHandle) -> Result<(), AppError> {
    app.opener()
        .open_url(bug_report_url(&system_info_text()), None::<&str>)
        .map_err(|error| AppError::new(ErrorCode::Unexpected).with_details(error.to_string()))
}

/// The newest entries of the log files, newest first, for the log viewer.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn read_logs(paths: State<'_, AppPaths>) -> Vec<entries::Entry> {
    // Log files can be large; the viewer shows the newest part.
    entries::read_newest(&paths.logs_dir(), 5000)
}

/// Saves a diagnostics bundle to a file the person chooses: the recent logs, the settings, system
/// information and crash reports, with private details removed. Returns the file, or nothing when
/// the person cancelled.
///
/// # Errors
///
/// `ARD-LOG-002` when the bundle cannot be written.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub async fn export_diagnostics(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    settings: State<'_, SettingsService>,
    redactor: State<'_, Redactor>,
) -> Result<Option<String>, AppError> {
    let Some(path) = choose_file(&app, FileKind::DiagnosticsToSave).await else {
        return Ok(None);
    };
    logging::flush();
    let system = preferences::read();
    let info = format!(
        "{}\nRegional format: {}\nText size: {}%",
        system_info_text(),
        system.locale,
        system.text_scale_percent
    );
    let settings_text = store::export_text(&settings.get());
    bundle::write(
        &path,
        &bundle::Inputs {
            logs: &paths.logs_dir(),
            crashes: &paths.crashes_dir(),
            settings: &settings_text,
            system_info: &info,
            redactor: &redactor,
        },
    )
    .map_err(|error| AppError::new(ErrorCode::DiagnosticsExport).with_details(error.to_string()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// The crash reports the person has not been told about yet.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn pending_crashes(paths: State<'_, AppPaths>) -> Vec<String> {
    crash::pending(&paths.crashes_dir())
}

/// Remembers that the person has been told about the crash reports there are now.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn acknowledge_crashes(paths: State<'_, AppPaths>) {
    if let Err(error) = crash::acknowledge(&paths.crashes_dir()) {
        tracing::warn!(%error, "could not remember that the crash reports were shown");
    }
}

/// The notice for a web engine that stopped and was started again, once. The window reloads
/// itself, so the notice waits until the page is back and asks for it.
#[tauri::command]
#[specta::specta]
pub fn take_web_engine_notice() -> Option<AppError> {
    crate::webview::take_failure().then(|| AppError::new(ErrorCode::WebEngineFailed))
}

/// Opens `settings.json` in the program Windows uses for JSON files.
///
/// # Errors
///
/// `ARD-SET-005` when Windows cannot open it.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn open_settings_file(app: AppHandle, paths: State<'_, AppPaths>) -> Result<(), AppError> {
    let file = paths.config.join(store::FILE);
    app.opener()
        .open_path(file.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::new(ErrorCode::SettingsOpen).with_details(error.to_string()))
}

/// The kinds of file the person is asked for.
#[derive(Clone, Copy)]
enum FileKind {
    SettingsToSave,
    SettingsToOpen,
    DiagnosticsToSave,
}

/// Asks the person for a file. A debug build can be told the answer, so tests need no dialog.
async fn choose_file(app: &AppHandle, kind: FileKind) -> Option<PathBuf> {
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

/// Saves the settings to a file the person chooses. Returns the file, or nothing when the person
/// cancelled.
///
/// # Errors
///
/// `ARD-SET-004` when the file cannot be written.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub async fn export_settings(
    app: AppHandle,
    settings: State<'_, SettingsService>,
) -> Result<Option<String>, AppError> {
    let Some(path) = choose_file(&app, FileKind::SettingsToSave).await else {
        return Ok(None);
    };
    settings.export_to(&path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Replaces the settings with the ones in a file the person chooses. Returns the new settings, or
/// nothing when the person cancelled. A file that is not valid changes nothing.
///
/// # Errors
///
/// `ARD-SET-003` when the file is not valid settings.
// Tauri hands commands their app handle and state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub async fn import_settings(
    app: AppHandle,
    settings: State<'_, SettingsService>,
) -> Result<Option<Settings>, AppError> {
    let Some(path) = choose_file(&app, FileKind::SettingsToOpen).await else {
        return Ok(None);
    };
    settings.import_from(&path).map(Some)
}

/// Puts every setting back to its default.
///
/// # Errors
///
/// `ARD-SET-001` when the settings file cannot be written.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn reset_settings(settings: State<'_, SettingsService>) -> Result<Settings, AppError> {
    settings.reset_all()
}

/// Wipes the settings, logs, crash reports and caches, and starts the app again. The wiping is done
/// by the new start, because the logs and caches are in use until then.
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
    app.request_restart();
    Ok(())
}

/// Starts the app again, for a setting that needs it.
// Tauri hands commands their app handle by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn restart_app(app: AppHandle) {
    app.request_restart();
}

/// What Windows says about the text size and the regional format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemPreferences {
    /// The text size as a percentage: 100 is normal, and Windows goes up to 225.
    pub text_scale_percent: u16,
    /// The regional format as a language tag such as `el-GR`.
    pub locale: String,
}

impl From<preferences::SystemPreferences> for SystemPreferences {
    fn from(preferences: preferences::SystemPreferences) -> Self {
        Self {
            text_scale_percent: preferences.text_scale_percent,
            locale: preferences.locale,
        }
    }
}

/// Sent to the UI whenever the text size or the regional format changes in Windows.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct SystemPreferencesChanged {
    pub preferences: SystemPreferences,
}

/// The text size and the regional format in Windows now.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008), even one that cannot fail yet.
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn get_system_preferences() -> Result<SystemPreferences, AppError> {
    Ok(preferences::read().into())
}

/// The problem found with the settings file when the app started, if any. It is handed over once.
// Tauri hands commands their state by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn take_settings_notice(settings: State<'_, SettingsService>) -> Option<AppError> {
    settings.take_notice()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bug_report_is_pre_filled_with_the_system_information_and_nothing_else() {
        let url = bug_report_url(
            "Arden Code 0.1.0\nBuild: abc (2026-09-30)\nWindows: Windows 11 (build 26100)",
        );

        assert!(
            url.starts_with(
                "https://github.com/valasme/arden-code/issues/new?template=bug_report.yml&system="
            ),
            "{url}"
        );
        assert!(
            url.contains("Arden%20Code%200.1.0%0ABuild%3A%20abc%20%282026-09-30%29"),
            "{url}"
        );
        // The address holds no character that would break it.
        assert!(!url.contains(' ') && !url.contains('\n'), "{url}");
    }

    #[test]
    fn text_is_written_so_that_it_fits_in_an_address() {
        assert_eq!(percent_encode("Aa0-_.~"), "Aa0-_.~");
        assert_eq!(percent_encode("a b&c=d"), "a%20b%26c%3Dd");
        assert_eq!(percent_encode("é"), "%C3%A9");
        assert_eq!(percent_encode("line\nbreak"), "line%0Abreak");
    }

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
