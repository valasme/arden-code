//! Signed automatic updates (plan section 6.7, ADR 0018).
//!
//! The app looks for a new version ten seconds after it starts and then every six hours, unless the
//! person turned automatic checks off. An update is downloaded in the background and checked against
//! the update signing key that is part of the app; one that is not signed by that key is thrown
//! away. When one is ready the status bar says so, and the person decides when to restart.

use std::sync::Mutex;
use std::time::Duration;

use arden_core::error::{AppError, ErrorCode};
use arden_settings::service::SettingsService;
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Error, Update, UpdaterExt};
use tauri_specta::Event;

/// How long after the start the first check waits, so it never slows the start down.
pub const FIRST_CHECK_DELAY: Duration = Duration::from_secs(10);
/// How long between two checks.
pub const CHECK_INTERVAL: Duration = Duration::from_hours(6);

/// Where an update is in its way to being installed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateStatus {
    /// Nothing is happening, and there is nothing to install.
    Idle,
    /// Looking for a new version.
    Checking,
    /// A new version is being downloaded.
    #[serde(rename_all = "camelCase")]
    Downloading { version: String },
    /// A new version is downloaded and checked. Restarting installs it.
    #[serde(rename_all = "camelCase")]
    Ready { version: String },
}

/// What a check found, for the person who asked for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CheckResult {
    /// This is the newest version.
    UpToDate,
    /// A new version is downloaded and waits for a restart.
    Ready,
    /// A check or a download is already going on.
    Busy,
    /// The check could not be done: no release exists yet, or the internet is not reachable.
    Unavailable,
    /// A release exists, but its signature is not valid, so it was not used.
    Rejected,
}

/// Tells the UI when the status changes.
#[derive(Debug, Clone, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusChanged {
    pub status: UpdateStatus,
}

/// A downloaded update that waits for a restart.
struct Pending {
    update: Update,
    bytes: Vec<u8>,
}

struct Inner {
    status: UpdateStatus,
    pending: Option<Pending>,
}

/// The state of updates, shared by the scheduler, the commands and the status bar.
pub struct Updates {
    inner: Mutex<Inner>,
}

impl Default for Updates {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                status: UpdateStatus::Idle,
                pending: None,
            }),
        }
    }
}

impl Updates {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Where an update is now.
    pub fn status(&self) -> UpdateStatus {
        self.lock().status.clone()
    }

    /// Takes the status from Idle to Checking, unless something is already going on (or an update
    /// already waits): then it says no.
    fn begin_check(&self) -> bool {
        let mut inner = self.lock();
        if inner.status == UpdateStatus::Idle {
            inner.status = UpdateStatus::Checking;
            true
        } else {
            false
        }
    }

    fn set(&self, status: UpdateStatus) {
        self.lock().status = status;
    }

    fn keep(&self, update: Update, bytes: Vec<u8>) {
        let mut inner = self.lock();
        inner.status = UpdateStatus::Ready {
            version: update.version.clone(),
        };
        inner.pending = Some(Pending { update, bytes });
    }

    /// Takes the downloaded update, when there is one.
    fn take_pending(&self) -> Option<Pending> {
        self.lock().pending.take()
    }
}

/// What the person is told about an error from the updater. Errors about the release itself (it
/// cannot be read, or its signature does not match) mean the update is refused; everything else
/// (no release yet, no internet) means there is nothing to say.
#[must_use]
pub fn classify(error: &Error) -> CheckResult {
    match error {
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::Serialization(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion
        | Error::InvalidUpdaterFormat => CheckResult::Rejected,
        _ => CheckResult::Unavailable,
    }
}

/// The variable that gives a debug build another address to look for updates. Tests use it to
/// point the app at a server of their own.
#[cfg(debug_assertions)]
const URL_VARIABLE: &str = "ARDEN_CODE_UPDATE_URL";
/// The variable that gives a debug build another signing key to trust, for the same tests.
#[cfg(debug_assertions)]
const PUBLIC_KEY_VARIABLE: &str = "ARDEN_CODE_UPDATE_PUBLIC_KEY";
/// The variables that shorten the waits of a debug build, in milliseconds.
#[cfg(debug_assertions)]
const FIRST_DELAY_VARIABLE: &str = "ARDEN_CODE_UPDATE_FIRST_DELAY_MS";
#[cfg(debug_assertions)]
const INTERVAL_VARIABLE: &str = "ARDEN_CODE_UPDATE_INTERVAL_MS";

/// How long the scheduler waits before the first check and between checks.
#[must_use]
pub fn schedule() -> (Duration, Duration) {
    #[cfg(debug_assertions)]
    {
        let read = |name: &str, fallback: Duration| {
            std::env::var(name)
                .ok()
                .and_then(|text| text.parse::<u64>().ok())
                .map_or(fallback, Duration::from_millis)
        };
        (
            read(FIRST_DELAY_VARIABLE, FIRST_CHECK_DELAY),
            read(INTERVAL_VARIABLE, CHECK_INTERVAL),
        )
    }
    #[cfg(not(debug_assertions))]
    {
        (FIRST_CHECK_DELAY, CHECK_INTERVAL)
    }
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, Error> {
    #[allow(unused_mut)]
    let mut builder = app.updater_builder();
    #[cfg(debug_assertions)]
    {
        if let Ok(url) = std::env::var(URL_VARIABLE) {
            builder = builder.endpoints(vec![url.parse()?])?;
        }
        if let Ok(key) = std::env::var(PUBLIC_KEY_VARIABLE) {
            builder = builder.pubkey(key);
        }
    }
    builder.build()
}

fn announce(app: &AppHandle, updates: &Updates) {
    let _ = UpdateStatusChanged {
        status: updates.status(),
    }
    .emit(app);
}

/// Looks for a new version, and downloads it when there is one. Nothing is installed.
pub async fn check(app: &AppHandle, updates: &Updates) -> CheckResult {
    if !updates.begin_check() {
        return if matches!(updates.status(), UpdateStatus::Ready { .. }) {
            CheckResult::Ready
        } else {
            CheckResult::Busy
        };
    }
    announce(app, updates);
    let result = look(app, updates).await;
    if result != CheckResult::Ready {
        updates.set(UpdateStatus::Idle);
    }
    announce(app, updates);
    result
}

async fn look(app: &AppHandle, updates: &Updates) -> CheckResult {
    let found = match updater(app) {
        Ok(checker) => checker.check().await,
        Err(error) => Err(error),
    };
    let update = match found {
        Ok(Some(update)) => update,
        Ok(None) => {
            tracing::info!("no update: this is the newest version");
            return CheckResult::UpToDate;
        }
        Err(error) => {
            // Until the first release exists, and whenever the internet is away, this is normal.
            tracing::info!(%error, "could not check for updates");
            return classify(&error);
        }
    };
    tracing::info!(version = %update.version, "an update is available, downloading it");
    updates.set(UpdateStatus::Downloading {
        version: update.version.clone(),
    });
    announce(app, updates);
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            tracing::info!(version = %update.version, "the update is downloaded and its signature is valid");
            updates.keep(update, bytes);
            CheckResult::Ready
        }
        Err(error) => {
            tracing::warn!(%error, "the update was not used");
            classify(&error)
        }
    }
}

/// Starts the checks: the first after ten seconds, then every six hours, each only when automatic
/// checks are on at that moment.
pub fn start(app: AppHandle) {
    let (first, interval) = schedule();
    std::thread::spawn(move || {
        std::thread::sleep(first);
        loop {
            let automatic = app
                .state::<SettingsService>()
                .get()
                .general
                .check_for_updates;
            if automatic {
                let updates = app.state::<Updates>();
                tauri::async_runtime::block_on(check(&app, &updates));
            }
            std::thread::sleep(interval);
        }
    });
}

/// Where an update is now.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[tauri::command]
#[specta::specta]
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
pub fn get_update_status(updates: State<'_, Updates>) -> Result<UpdateStatus, AppError> {
    Ok(updates.status())
}

/// Looks for a new version now, for the person who asked, and downloads it when there is one. What
/// it found is the answer; a check that could not be done is not an error.
#[tauri::command]
#[specta::specta]
pub async fn check_for_updates(
    app: AppHandle,
    updates: State<'_, Updates>,
) -> Result<CheckResult, AppError> {
    Ok(check(&app, &updates).await)
}

/// Installs the update that is ready and restarts into the new version.
///
/// # Errors
///
/// Returns `ARD-UPD-001` when there is no update or it cannot be installed.
#[tauri::command]
#[specta::specta]
#[allow(clippy::needless_pass_by_value)]
pub fn restart_to_update(app: AppHandle, updates: State<'_, Updates>) -> Result<(), AppError> {
    install(&app, &updates)
        .map_err(|error| AppError::new(ErrorCode::UpdateInstall).with_details(error))
}

/// Installs the downloaded update and restarts into it.
///
/// # Errors
///
/// Returns the reason as text when there is no update, or it cannot be installed.
pub fn install(app: &AppHandle, updates: &Updates) -> Result<(), String> {
    let pending = updates
        .take_pending()
        .ok_or_else(|| "there is no update to install".to_owned())?;
    tracing::info!(version = %pending.update.version, "installing the update");
    pending
        .update
        .install(&pending.bytes)
        .map_err(|error| error.to_string())?;
    // The installer starts the new version. This one ends.
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_check_may_start_only_when_nothing_is_going_on() {
        let updates = Updates::default();

        assert!(updates.begin_check());
        assert_eq!(updates.status(), UpdateStatus::Checking);
        assert!(!updates.begin_check(), "a second check waits for the first");

        updates.set(UpdateStatus::Idle);
        assert!(updates.begin_check());
    }

    #[test]
    fn no_new_check_starts_while_a_download_or_a_ready_update_is_there() {
        let updates = Updates::default();
        updates.set(UpdateStatus::Downloading {
            version: "2.0.0".into(),
        });
        assert!(!updates.begin_check());

        updates.set(UpdateStatus::Ready {
            version: "2.0.0".into(),
        });
        assert!(!updates.begin_check());
    }

    #[test]
    fn nothing_is_installed_when_there_is_no_update() {
        let updates = Updates::default();

        assert!(updates.take_pending().is_none());
    }

    #[test]
    fn a_release_that_cannot_be_trusted_is_refused_and_a_missing_one_is_not_news() {
        let signature = Error::SignatureUtf8("not a signature".into());
        let unreadable =
            Error::Serialization(serde_json::from_str::<u8>("{").expect_err("not a number"));
        let wrong_version = Error::SignedVersionMismatch {
            signed: "1.0.0".into(),
            announced: "9.9.9".into(),
        };

        for error in [
            signature,
            unreadable,
            wrong_version,
            Error::MissingSignedVersion,
        ] {
            assert_eq!(classify(&error), CheckResult::Rejected, "{error}");
        }
        for error in [
            Error::ReleaseNotFound,
            Error::Network("offline".into()),
            Error::EmptyEndpoints,
        ] {
            assert_eq!(classify(&error), CheckResult::Unavailable, "{error}");
        }
    }

    #[test]
    fn checks_start_ten_seconds_after_launch_and_repeat_every_six_hours() {
        assert_eq!(FIRST_CHECK_DELAY, Duration::from_secs(10));
        assert_eq!(CHECK_INTERVAL, Duration::from_secs(21_600));
    }
}
