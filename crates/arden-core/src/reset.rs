//! Resetting Arden Code: wiping its settings, logs, crash reports and caches.
//!
//! The logs are open while the app runs, and so is the web engine's cache, so a reset is done in two
//! steps. [`request`] leaves a marker file and the app restarts; on the next start, once the old one
//! and its web engine have ended, [`apply_pending`] runs before anything is opened and removes the
//! folders (ADR 0031).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use crate::APP_IDENTIFIER;
use crate::error::{AppError, ErrorCode};
use crate::paths::AppPaths;

/// The file whose presence asks for a reset at the next start.
pub const MARKER_FILE: &str = "reset-requested";

fn marker(paths: &AppPaths) -> PathBuf {
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
/// The logs, crash reports and caches go first: they are what another program may still have open,
/// and they are worth nothing once a reset was asked for. The settings go next, all at once, and the
/// request last. So a reset that cannot finish keeps the settings and the request, and the next start
/// finishes it. Something that another program has open is tried again, for up to `patience` in all:
/// programs such as virus scanners open new files for a moment.
///
/// # Errors
///
/// Returns the problem that stopped the reset. A folder that is not named like one of the app's is
/// refused, and then nothing is removed.
pub fn apply_pending(paths: &AppPaths, patience: Duration) -> io::Result<bool> {
    let deadline = Instant::now() + patience;
    let remove = |path: &Path| {
        retry_until(deadline, || {
            if path.is_dir() {
                fs::remove_dir_all(path)
            } else {
                fs::remove_file(path)
            }
        })
    };
    let marker = marker(paths);
    if !marker.exists() {
        return Ok(false);
    }
    if let Some(folder) = [&paths.config, &paths.local]
        .into_iter()
        .find(|folder| !is_app_folder(folder))
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!("{} is not one of the app's folders", folder.display()),
        ));
    }
    if paths.local.exists() {
        for entry in fs::read_dir(&paths.local)? {
            let path = entry?.path();
            if path != marker {
                remove(&path)?;
            }
        }
    }
    // Removed file by file, the settings could be half gone when one of them is in use. Windows does
    // not move a folder while a file in it is open, so the folder is moved out of the way first.
    let settings_going = going(&paths.config);
    remove(&settings_going)?;
    retry_until(deadline, || fs::rename(&paths.config, &settings_going))?;
    remove(&settings_going)?;
    fs::remove_file(&marker)?;
    // Empty now. It is made again when something is written to it.
    let _ = fs::remove_dir(&paths.local);
    Ok(true)
}

/// Where `folder` is moved on its way out: next to it, so the move stays on its drive.
fn going(folder: &Path) -> PathBuf {
    let mut name = folder.file_name().unwrap_or_default().to_os_string();
    name.push(".removing");
    folder.with_file_name(name)
}

/// How long to wait before trying again to change something that is in use.
const RETRY_AFTER: Duration = Duration::from_millis(50);

/// Runs `attempt` until it works, or until `deadline` while it fails. What is not there counts as
/// done: it is what removing and moving are for.
fn retry_until(deadline: Instant, mut attempt: impl FnMut() -> io::Result<()>) -> io::Result<()> {
    loop {
        match attempt() {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(_) if Instant::now() < deadline => thread::sleep(RETRY_AFTER),
            done => return done,
        }
    }
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

        assert!(!apply_pending(&paths, Duration::ZERO).unwrap());

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
        let (data, paths) = used_app();
        request(&paths).unwrap();
        // Left by a reset that stopped while it removed the settings.
        let half_removed = data.path().join("config.removing");
        fs::create_dir_all(&half_removed).unwrap();
        fs::write(half_removed.join("settings.json"), "{}").unwrap();

        assert!(apply_pending(&paths, Duration::ZERO).unwrap());

        assert!(!paths.config.exists());
        assert!(!paths.local.exists(), "the marker goes with the rest");
        assert_eq!(
            fs::read_dir(data.path()).unwrap().count(),
            0,
            "nothing is left"
        );
    }

    #[test]
    fn a_reset_is_done_once() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();
        apply_pending(&paths, Duration::ZERO).unwrap();
        fs::create_dir_all(&paths.config).unwrap();
        fs::write(paths.config.join("settings.json"), "{}").unwrap();

        assert!(!apply_pending(&paths, Duration::ZERO).unwrap());

        assert!(paths.config.join("settings.json").exists());
    }

    /// Opens `file` the way the web engine opens its own files: no other program may delete it while
    /// it is open. It stays open until the returned sender is dropped or sent to.
    #[cfg(windows)]
    fn hold(file: &Path) -> std::sync::mpsc::Sender<()> {
        use std::os::windows::fs::OpenOptionsExt;

        let (opened_tx, opened) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel::<()>();
        let file = file.to_path_buf();
        std::thread::spawn(move || {
            let open = fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(&file)
                .unwrap();
            opened_tx.send(()).unwrap();
            let _ = released.recv();
            drop(open);
        });
        opened.recv().unwrap();
        release
    }

    #[cfg(windows)]
    #[test]
    fn a_reset_that_cannot_finish_keeps_the_settings_and_finishes_at_the_next_start() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();
        let engine_file = paths.local.join("EBWebView").join("cache");
        let in_use = hold(&engine_file);

        assert!(apply_pending(&paths, Duration::from_millis(200)).is_err());
        assert!(
            paths.config.join("settings.json").exists(),
            "the settings stay"
        );
        assert!(paths.local.join(MARKER_FILE).exists(), "the request stays");

        drop(in_use);
        assert!(apply_pending(&paths, Duration::from_millis(200)).unwrap());
        assert!(!paths.config.exists());
        assert!(!paths.local.exists());
    }

    #[cfg(windows)]
    #[test]
    fn settings_that_cannot_all_go_all_stay() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();
        // Removed one by one, the settings file would go before this one is found in use.
        let schema = paths.config.join("settings.schema.json");
        fs::write(&schema, "{}").unwrap();
        let in_use = hold(&schema);

        assert!(apply_pending(&paths, Duration::from_millis(200)).is_err());
        assert!(
            paths.config.join("settings.json").exists(),
            "the settings stay"
        );
        assert!(paths.local.join(MARKER_FILE).exists(), "the request stays");

        drop(in_use);
        assert!(apply_pending(&paths, Duration::from_millis(200)).unwrap());
        assert!(!paths.config.exists());
        assert!(!paths.local.exists());
    }

    #[cfg(windows)]
    #[test]
    fn a_file_that_is_in_use_for_a_moment_does_not_stop_the_reset() {
        let (_data, paths) = used_app();
        request(&paths).unwrap();
        let in_use = hold(&paths.local.join("EBWebView").join("cache"));
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            drop(in_use);
        });

        assert!(apply_pending(&paths, Duration::from_secs(5)).unwrap());
        assert!(!paths.config.exists());
        assert!(!paths.local.exists());
    }

    #[test]
    fn it_works_when_some_folders_were_never_created() {
        let data = tempfile::tempdir().unwrap();
        let paths = AppPaths::resolve(Some(data.path()), Path::new("."), Path::new("."));
        request(&paths).unwrap();

        assert!(apply_pending(&paths, Duration::ZERO).unwrap());
    }

    #[test]
    fn a_reset_that_would_reach_a_folder_that_is_not_the_apps_removes_nothing() {
        let data = tempfile::tempdir().unwrap();
        let documents = data.path().join("Documents");
        fs::create_dir_all(&documents).unwrap();
        fs::write(documents.join("thesis.docx"), "precious").unwrap();
        let paths = AppPaths {
            config: documents.clone(),
            local: data.path().join("local"),
        };
        fs::create_dir_all(paths.logs_dir()).unwrap();
        fs::write(paths.logs_dir().join("arden.jsonl"), "line").unwrap();
        request(&paths).unwrap();

        let result = apply_pending(&paths, Duration::ZERO);

        assert!(result.is_err());
        assert!(documents.join("thesis.docx").exists());
        assert!(paths.logs_dir().join("arden.jsonl").exists());
        assert!(paths.local.join(MARKER_FILE).exists(), "the request stays");
    }
}
