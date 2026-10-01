//! The commands of the settings: reading, changing and resetting them, the settings file, and
//! Windows' text size and regional format. Each one returns a typed `AppError` on failure (ADR 0008).

use crate::commands::{FileKind, choose_file};
use arden_core::error::{AppError, ErrorCode};
use arden_core::paths::AppPaths;
use arden_settings::service::SettingsService;
use arden_settings::settings::{SettingChange, SettingKey, Settings};
use arden_settings::store;
use arden_windows::preferences;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

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
///
/// # Errors
///
/// Never fails: the notice itself is the error to show, not a failure of this command.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn take_settings_notice(
    settings: State<'_, SettingsService>,
) -> Result<Option<AppError>, AppError> {
    Ok(settings.take_notice())
}
