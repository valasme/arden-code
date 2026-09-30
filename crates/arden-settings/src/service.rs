//! The running settings: the current values, changes, and watching the file for hand edits.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, Weak};
use std::thread;
use std::time::Duration;

use arden_core::error::AppError;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::settings::{SettingChange, Settings};
use crate::store;

/// How long the file must stay quiet before a hand edit is read.
const QUIET_PERIOD: Duration = Duration::from_millis(200);

/// How long to wait for an editor that has emptied the file and not yet filled it.
const EDITOR_GRACE: Duration = Duration::from_millis(300);

type Listener = Box<dyn Fn(&Settings, Option<&AppError>) + Send + Sync>;

struct State {
    settings: Settings,
    /// The problem found at startup, handed over once.
    startup_notice: Option<AppError>,
}

struct Inner {
    dir: PathBuf,
    state: Mutex<State>,
    listeners: Mutex<Vec<Listener>>,
}

impl Inner {
    fn announce(&self, settings: &Settings, notice: Option<&AppError>) {
        if let Ok(listeners) = self.listeners.lock() {
            for listener in listeners.iter() {
                listener(settings, notice);
            }
        }
    }

    /// Reads the file again after it changed, and announces what is different.
    fn reload(&self) {
        // An editor may leave the file empty for a moment while it saves. Look again before
        // deciding that the file is broken.
        if !store::is_usable(&self.dir) {
            thread::sleep(EDITOR_GRACE);
        }
        let loaded = store::load(&self.dir);

        let changed = match self.state.lock() {
            Ok(mut state) => {
                let changed = state.settings != loaded.settings || loaded.notice.is_some();
                if changed {
                    state.settings = loaded.settings.clone();
                }
                changed
            }
            Err(_) => false,
        };
        if changed {
            self.announce(&loaded.settings, loaded.notice.as_ref());
        }
    }
}

/// Watches the settings folder and reloads when `settings.json` changes. The thread ends when the
/// service is dropped.
fn watch(inner: &Arc<Inner>) -> Option<RecommendedWatcher> {
    let (notify_change, changes) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event
            && !matches!(event.kind, EventKind::Access(_))
            && event
                .paths
                .iter()
                .any(|path| path.file_name().is_some_and(|name| name == store::FILE))
        {
            let _ = notify_change.send(());
        }
    })
    .ok()?;
    watcher
        .watch(&inner.dir, RecursiveMode::NonRecursive)
        .ok()?;

    let inner: Weak<Inner> = Arc::downgrade(inner);
    thread::spawn(move || {
        while changes.recv().is_ok() {
            loop {
                match changes.recv_timeout(QUIET_PERIOD) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            let Some(inner) = inner.upgrade() else { return };
            inner.reload();
        }
    });
    Some(watcher)
}

/// The settings while the app runs.
pub struct SettingsService {
    inner: Arc<Inner>,
    /// Kept alive so that the folder stays watched. `None` when watching is not possible, in which
    /// case hand edits are only noticed after a restart.
    _watcher: Option<RecommendedWatcher>,
}

impl SettingsService {
    /// Loads the settings from `dir` (creating the files on a first launch) and starts watching
    /// them. It never fails: a file that cannot be used becomes a notice and the defaults.
    #[must_use]
    pub fn start(dir: &Path) -> Self {
        let loaded = store::load(dir);
        let inner = Arc::new(Inner {
            dir: dir.to_path_buf(),
            state: Mutex::new(State {
                settings: loaded.settings,
                startup_notice: loaded.notice,
            }),
            listeners: Mutex::new(Vec::new()),
        });
        let watcher = watch(&inner);
        if watcher.is_none() {
            tracing::warn!("the settings folder cannot be watched; hand edits need a restart");
        }
        Self {
            inner,
            _watcher: watcher,
        }
    }

    /// The settings now.
    ///
    /// # Panics
    ///
    /// Panics only if another thread panicked while holding the settings, which nothing does.
    #[must_use]
    pub fn get(&self) -> Settings {
        self.inner
            .state
            .lock()
            .expect("settings lock")
            .settings
            .clone()
    }

    /// The problem found when the app started, if any. It is handed over once, so the person is only
    /// told once.
    ///
    /// # Panics
    ///
    /// Panics only if another thread panicked while holding the settings, which nothing does.
    #[must_use]
    pub fn take_notice(&self) -> Option<AppError> {
        self.inner
            .state
            .lock()
            .expect("settings lock")
            .startup_notice
            .take()
    }

    /// Calls `listener` whenever the settings change, whether through [`Self::update`] or by a
    /// hand edit of the file. The notice is set when the file was unusable and the defaults took over.
    ///
    /// # Panics
    ///
    /// Panics only if another thread panicked while holding the listeners, which nothing does.
    pub fn subscribe(
        &self,
        listener: impl Fn(&Settings, Option<&AppError>) + Send + Sync + 'static,
    ) {
        self.inner
            .listeners
            .lock()
            .expect("listeners lock")
            .push(Box::new(listener));
    }

    /// Changes one setting, saves it, and announces it.
    ///
    /// # Errors
    ///
    /// `ARD-SET-001` when the file cannot be written. The setting then stays as it was.
    ///
    /// # Panics
    ///
    /// Panics only if another thread panicked while holding the settings, which nothing does.
    pub fn update(&self, change: SettingChange) -> Result<Settings, AppError> {
        let next = {
            // Held until the file is written, so that a reload cannot read a state in between.
            let mut state = self.inner.state.lock().expect("settings lock");
            let mut next = state.settings.clone();
            next.apply(change);
            if next == state.settings {
                return Ok(next);
            }
            store::save(&self.inner.dir, &next)?;
            state.settings = next.clone();
            next
        };
        self.inner.announce(&next, None);
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    use arden_core::error::ErrorCode;

    use super::*;
    use crate::settings::{SettingChange, Settings, Theme};
    use crate::store;

    type Announcements = Arc<Mutex<Vec<(Settings, Option<ErrorCode>)>>>;

    fn listen(service: &SettingsService) -> Announcements {
        let seen: Announcements = Arc::default();
        let sink = Arc::clone(&seen);
        service.subscribe(move |settings, notice| {
            sink.lock()
                .unwrap()
                .push((settings.clone(), notice.map(|notice| notice.code)));
        });
        seen
    }

    /// Waits for something that happens on another thread, up to five seconds.
    fn eventually(mut condition: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if condition() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    fn write_settings(folder: &Path, text: &str) {
        fs::write(folder.join("settings.json"), text).unwrap();
    }

    #[test]
    fn starts_with_the_defaults_and_no_notice_on_a_first_launch() {
        let folder = tempfile::tempdir().unwrap();

        let service = SettingsService::start(folder.path());

        assert_eq!(service.get(), Settings::default());
        assert!(service.take_notice().is_none());
    }

    #[test]
    fn a_broken_file_at_startup_becomes_a_notice_that_is_handed_over_once() {
        let folder = tempfile::tempdir().unwrap();
        write_settings(folder.path(), "{ broken");

        let service = SettingsService::start(folder.path());

        assert_eq!(service.get(), Settings::default());
        assert_eq!(
            service.take_notice().map(|notice| notice.code),
            Some(ErrorCode::SettingsInvalid)
        );
        assert!(service.take_notice().is_none(), "the person is told once");
    }

    #[test]
    fn a_change_is_saved_and_announced_once() {
        let folder = tempfile::tempdir().unwrap();
        let service = SettingsService::start(folder.path());
        let seen = listen(&service);

        let updated = service
            .update(SettingChange::AppearanceTheme(Theme::Dark))
            .unwrap();

        assert_eq!(updated.appearance.theme, Theme::Dark);
        assert_eq!(service.get().appearance.theme, Theme::Dark);
        assert_eq!(
            store::load(folder.path()).settings.appearance.theme,
            Theme::Dark
        );
        // Give the file watcher time to report the service's own save. It must not be announced again.
        std::thread::sleep(Duration::from_millis(1200));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1, "{seen:?}");
        assert_eq!(seen[0].0.appearance.theme, Theme::Dark);
    }

    #[test]
    fn a_hand_edit_is_picked_up_and_announced() {
        let folder = tempfile::tempdir().unwrap();
        let service = SettingsService::start(folder.path());
        let seen = listen(&service);

        write_settings(
            folder.path(),
            r#"{"version":1,"appearance":{"theme":"light"}}"#,
        );

        assert!(eventually(|| service.get().appearance.theme == Theme::Light));
        assert!(eventually(|| !seen.lock().unwrap().is_empty()));
        assert_eq!(seen.lock().unwrap()[0].0.appearance.theme, Theme::Light);
    }

    #[test]
    fn a_hand_edit_that_changes_nothing_is_not_announced() {
        let folder = tempfile::tempdir().unwrap();
        let service = SettingsService::start(folder.path());
        let seen = listen(&service);

        // Same settings, different layout and an added key of the person's own.
        write_settings(
            folder.path(),
            r#"{ "version": 1, "note": "mine", "appearance": { "theme": "system" } }"#,
        );
        std::thread::sleep(Duration::from_millis(1200));

        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn a_broken_hand_edit_falls_back_to_the_defaults_and_says_so() {
        let folder = tempfile::tempdir().unwrap();
        let service = SettingsService::start(folder.path());
        service
            .update(SettingChange::AppearanceTheme(Theme::Dark))
            .unwrap();
        let seen = listen(&service);

        write_settings(folder.path(), r#"{"appearance":{"theme":"purple"}}"#);

        assert!(eventually(|| !seen.lock().unwrap().is_empty()));
        let (settings, notice) = seen.lock().unwrap()[0].clone();
        assert_eq!(settings, Settings::default());
        assert_eq!(notice, Some(ErrorCode::SettingsInvalid));
        assert!(fs::read_dir(folder.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("settings.invalid-")
        }));
    }

    #[test]
    fn a_file_that_is_being_written_is_not_mistaken_for_a_broken_one() {
        let folder = tempfile::tempdir().unwrap();
        let service = SettingsService::start(folder.path());
        let seen = listen(&service);

        // Some editors empty the file first and fill it a moment later.
        write_settings(folder.path(), "");
        std::thread::sleep(Duration::from_millis(80));
        write_settings(
            folder.path(),
            r#"{"version":1,"appearance":{"theme":"dark"}}"#,
        );

        assert!(eventually(|| service.get().appearance.theme == Theme::Dark));
        std::thread::sleep(Duration::from_millis(800));
        assert!(
            seen.lock()
                .unwrap()
                .iter()
                .all(|(_, notice)| notice.is_none())
        );
        assert!(!fs::read_dir(folder.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("settings.invalid-")
        }));
    }
}
