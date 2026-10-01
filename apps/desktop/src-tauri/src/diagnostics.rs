//! The commands of diagnostics: logs, crash reports, the diagnostics bundle, system information and
//! bug reports. Each one returns a typed `AppError` on failure (ADR 0008).

use crate::commands::{FileKind, choose_file, system_info_text};
use arden_core::error::{AppError, ErrorCode};
use arden_core::paths::AppPaths;
use arden_diagnostics::logging::{self, UiLevel};
use arden_diagnostics::redact::Redactor;
use arden_diagnostics::{bundle, crash, entries};
use arden_settings::service::SettingsService;
use arden_settings::store;
use arden_windows::preferences;
use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

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
///
/// # Errors
///
/// Never fails: a message that cannot be written is lost, as Rust's own would be.
// Tauri hands commands their arguments by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn log_from_ui(
    level: UiLogLevel,
    source: String,
    message: String,
    code: Option<String>,
) -> Result<(), AppError> {
    logging::ui(level.into(), &source, &message, code.as_deref());
    Ok(())
}

/// Removes private details (the user's folder, email addresses, secrets) from text the user is about
/// to share, using the same rules as the log files.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Tauri hands commands their arguments and state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn redact_text(text: String, redactor: State<'_, Redactor>) -> Result<String, AppError> {
    Ok(redactor.redact(&text))
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
///
/// # Errors
///
/// Never fails: unreadable files are skipped.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn read_logs(paths: State<'_, AppPaths>) -> Result<Vec<entries::Entry>, AppError> {
    // Log files can be large; the viewer shows the newest part.
    Ok(entries::read_newest(&paths.logs_dir(), 5000))
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
///
/// # Errors
///
/// Never fails: a folder that cannot be read has none.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn pending_crashes(paths: State<'_, AppPaths>) -> Result<Vec<String>, AppError> {
    Ok(crash::pending(&paths.crashes_dir()))
}

/// Remembers that the person has been told about the crash reports there are now.
///
/// # Errors
///
/// Never fails: if it cannot be remembered, that is logged and the reports are offered again.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn acknowledge_crashes(paths: State<'_, AppPaths>) -> Result<(), AppError> {
    if let Err(error) = crash::acknowledge(&paths.crashes_dir()) {
        tracing::warn!(%error, "could not remember that the crash reports were shown");
    }
    Ok(())
}

/// The notice for a web engine that stopped and was started again, once. The window reloads
/// itself, so the notice waits until the page is back and asks for it.
///
/// # Errors
///
/// Never fails: the notice itself is the error to show, not a failure of this command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn take_web_engine_notice() -> Result<Option<AppError>, AppError> {
    Ok(crate::webview::take_failure().then(|| AppError::new(ErrorCode::WebEngineFailed)))
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
///
/// # Errors
///
/// Never returns one: the panic is on another thread.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub fn debug_panic() -> Result<(), AppError> {
    // A panic on a Tauri command thread is caught and reported by Tauri; this one is on its own
    // thread, like a real crash in background work.
    std::thread::spawn(|| panic!("deliberate panic for testing"));
    Ok(())
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
}
