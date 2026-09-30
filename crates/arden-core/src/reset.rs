//! Resetting Arden Code: wiping its settings, logs, crash reports and caches.
//!
//! The logs are open while the app runs, and so is the web engine's cache, so a reset is done in two
//! steps. [`request`] leaves a marker file and the app restarts; on the next start,
//! [`apply_pending`] runs before anything is opened and removes the folders.

use std::fs;
use std::io;
use std::path::Path;

use crate::APP_IDENTIFIER;
use crate::error::{AppError, ErrorCode};
use crate::paths::AppPaths;

/// The file whose presence asks for a reset at the next start.
pub const MARKER_FILE: &str = "reset-requested";

fn marker(paths: &AppPaths) -> std::path::PathBuf {
    paths.local.join(MARKER_FILE)
}

/// Asks for everything to be wiped when the app next starts.
///
/// # Errors
///
/// `ARD-APP-003` when the marker cannot be written.
pub fn request(paths: &AppPaths) -> Result<(), AppError> {
    let failed =
        |error: io::Error| AppError::new(ErrorCode::ResetApp).with_details(error.to_string());
    fs::create_dir_all(&paths.local).map_err(failed)?;
    fs::write(marker(paths), "").map_err(failed)
}

/// A folder is the app's own when it is named like one of the app's folders. Anything else is left
/// alone, so a wrong setting (such as a data folder pointed at someone's documents) cannot make a
/// reset delete what is not the app's.
fn is_app_folder(folder: &Path) -> bool {
    folder
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == APP_IDENTIFIER || name == "config" || name == "local")
}

/// Wipes the app's folders when a reset was asked for. Returns whether one was done.
///
/// # Errors
///
/// Returns the first problem met while removing files, after trying everything else. A folder that
/// is not named like one of the app's is refused.
pub fn apply_pending(paths: &AppPaths) -> io::Result<bool> {
    if !marker(paths).exists() {
        return Ok(false);
    }
    let mut first_problem = None;
    for folder in [&paths.config, &paths.local] {
        if !is_app_folder(folder) {
            first_problem.get_or_insert_with(|| {
                io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!("{} is not one of the app's folders", folder.display()),
                )
            });
            continue;
        }
        if folder.exists()
            && let Err(error) = fs::remove_dir_all(folder)
        {
            first_problem.get_or_insert(error);
        }
    }
    first_problem.map_or(Ok(true), Err)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The folders of a person who has used the app for a while.
    fn used_app() -> (tempfile::TempDir, AppPaths) {
        let data = tempfile::tempdir().unwrap();
        let paths = AppPaths::resolve(Some(data.path()), Path::new("."), Path::new("."));
        fs::create_dir_all(paths.logs_dir()).unwrap();
        fs::create_dir_all(paths.crashes_dir()).unwrap();
        fs::create_dir_all(paths.local.join("EBWebView")).unwrap();
        fs::create_dir_all(&paths.config).unwrap();
        fs::write(paths.config.join("settings.json"), "{}").unwrap();
        fs::write(paths.logs_dir().join("arden.jsonl"), "line").unwrap();
        fs::write(paths.local.join("EBWebView").join("cache"), "x").unwrap();
        (data, paths)
    }

    #[test]
    fn nothing_is_removed_until_a_reset_is_asked_for() {
        let (_data, paths) = used_app();

        assert!(!apply_pending(&paths).unwrap());

        assert!(paths.config.join("settings.json").exists());
        assert!(paths.logs_dir().join("arden.jsonl").exists());
    }

    #[test]
    fn asking_for_a_reset_only_leaves_a_marker() {
        let (_data, paths) = used_app();

        request(&paths).unwrap();

        assert!(paths.local.join(MARKER_FILE).exists());
        assert!(
            paths.config.join("settings.json").exists(),
            "nothing is deleted yet"
        );
    }

    #[test]
    fn a_pending_reset_removes_settings_logs_crash_reports_and_caches() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();

        assert!(apply_pending(&paths).unwrap());

        assert!(!paths.config.exists());
        assert!(!paths.local.exists(), "the marker goes with the rest");
    }

    #[test]
    fn a_reset_is_done_once() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();
        apply_pending(&paths).unwrap();
        fs::create_dir_all(&paths.config).unwrap();
        fs::write(paths.config.join("settings.json"), "{}").unwrap();

        assert!(!apply_pending(&paths).unwrap());

        assert!(paths.config.join("settings.json").exists());
    }

    #[test]
    fn it_works_when_some_folders_were_never_created() {
        let data = tempfile::tempdir().unwrap();
        let paths = AppPaths::resolve(Some(data.path()), Path::new("."), Path::new("."));
        request(&paths).unwrap();

        assert!(apply_pending(&paths).unwrap());
    }

    #[test]
    fn a_folder_that_is_not_named_like_the_apps_is_never_removed() {
        let data = tempfile::tempdir().unwrap();
        let documents = data.path().join("Documents");
        fs::create_dir_all(&documents).unwrap();
        fs::write(documents.join("thesis.docx"), "precious").unwrap();
        let paths = AppPaths {
            config: documents.clone(),
            local: data.path().join("local"),
        };
        request(&paths).unwrap();

        let result = apply_pending(&paths);

        assert!(result.is_err());
        assert!(documents.join("thesis.docx").exists());
        assert!(!paths.local.exists(), "the app's own folder is still wiped");
    }
}
