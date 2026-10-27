//! Where Arden Code keeps its files.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::APP_IDENTIFIER;

/// The environment variable that moves all of Arden Code's data into one folder. It exists for
/// automated tests, so they never touch a real user's settings, and for portable setups.
pub const DATA_DIR_VARIABLE: &str = "ARDEN_CODE_DATA_DIR";

/// The folders for the app's files: settings live in `config`; sessions, logs, crash reports and
/// caches in `local`. Nothing is created until something is written.
///
/// On Windows they are in the roaming and local data folders. On Linux they follow the XDG base
/// directories, as Tauri's path API does (ADR 0059): `$XDG_CONFIG_HOME`, or `~/.config`, and
/// `$XDG_DATA_HOME`, or `~/.local/share`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    /// `%APPDATA%\io.github.valasme.arden` or `~/.config/io.github.valasme.arden`: settings and
    /// other files that follow the user.
    pub config: PathBuf,
    /// `%LOCALAPPDATA%\io.github.valasme.arden` or `~/.local/share/io.github.valasme.arden`:
    /// sessions, logs, crash reports and caches.
    pub local: PathBuf,
}

/// An XDG base directory: the folder `variable` names when it is an absolute path, and otherwise
/// `fallback` in the home folder. The specification says a relative path is to be ignored.
#[must_use]
pub fn xdg_folder(variable: Option<OsString>, home: Option<&Path>, fallback: &str) -> PathBuf {
    variable
        .map(PathBuf::from)
        .filter(|folder| folder.is_absolute())
        .or_else(|| home.map(|home| home.join(fallback)))
        .unwrap_or_else(|| PathBuf::from(fallback))
}

impl AppPaths {
    /// Works out the folders from the platform's folders for settings (Windows' roaming folder) and
    /// for local data, unless `data_dir` is given, in which case everything lives inside it.
    #[must_use]
    pub fn resolve(data_dir: Option<&Path>, roaming: &Path, local: &Path) -> Self {
        match data_dir {
            Some(directory) => Self {
                config: directory.join("config"),
                local: directory.join("local"),
            },
            None => Self {
                config: roaming.join(APP_IDENTIFIER),
                local: local.join(APP_IDENTIFIER),
            },
        }
    }

    /// The folder for log files.
    #[must_use]
    pub fn logs_dir(&self) -> PathBuf {
        self.local.join("logs")
    }

    /// The folder for crash reports.
    #[must_use]
    pub fn crashes_dir(&self) -> PathBuf {
        self.local.join("crashes")
    }

    /// The Playground, the built-in project: a real folder, made on the first launch.
    #[must_use]
    pub fn playground_dir(&self) -> PathBuf {
        self.local.join("playground")
    }

    /// The saved sessions (ADR 0035). They stay with the local files: a transcript can be large, and
    /// it has no reason to roam with the Windows profile.
    #[must_use]
    pub fn sessions_file(&self) -> PathBuf {
        self.local.join("sessions.db")
    }

    /// The saved window position and size.
    #[must_use]
    pub fn window_state_file(&self) -> PathBuf {
        self.config.join("window-state.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn uses_the_windows_data_folders_and_the_app_identifier() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.config,
            Path::new(r"C:\Roaming\io.github.valasme.arden")
        );
        assert_eq!(paths.local, Path::new(r"C:\Local\io.github.valasme.arden"));
    }

    #[cfg(windows)]
    #[test]
    fn keeps_everything_inside_the_override_folder_when_one_is_given() {
        let paths = AppPaths::resolve(
            Some(Path::new(r"C:\Temp\test-data")),
            Path::new(r"C:\Roaming"),
            Path::new(r"C:\Local"),
        );

        assert_eq!(paths.config, Path::new(r"C:\Temp\test-data\config"));
        assert_eq!(paths.local, Path::new(r"C:\Temp\test-data\local"));
    }

    #[cfg(windows)]
    #[test]
    fn keeps_logs_and_crash_reports_with_the_local_files() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.logs_dir(),
            Path::new(r"C:\Local\io.github.valasme.arden\logs")
        );
        assert_eq!(
            paths.crashes_dir(),
            Path::new(r"C:\Local\io.github.valasme.arden\crashes")
        );
    }

    #[cfg(windows)]
    #[test]
    fn keeps_the_sessions_with_the_local_files_so_they_never_roam() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.sessions_file(),
            Path::new(r"C:\Local\io.github.valasme.arden\sessions.db")
        );
    }

    #[cfg(windows)]
    #[test]
    fn puts_the_window_state_next_to_the_settings() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.window_state_file(),
            Path::new(r"C:\Roaming\io.github.valasme.arden\window-state.json")
        );
    }

    #[cfg(unix)]
    #[test]
    fn uses_the_xdg_folders_and_the_app_identifier_on_linux() {
        let paths = AppPaths::resolve(
            None,
            Path::new("/home/ada/.config"),
            Path::new("/home/ada/.local/share"),
        );

        assert_eq!(
            paths.config,
            Path::new("/home/ada/.config/io.github.valasme.arden")
        );
        assert_eq!(
            paths.local,
            Path::new("/home/ada/.local/share/io.github.valasme.arden")
        );
        assert_eq!(
            paths.sessions_file(),
            Path::new("/home/ada/.local/share/io.github.valasme.arden/sessions.db")
        );
        assert_eq!(
            paths.logs_dir(),
            Path::new("/home/ada/.local/share/io.github.valasme.arden/logs")
        );
        assert_eq!(
            paths.window_state_file(),
            Path::new("/home/ada/.config/io.github.valasme.arden/window-state.json")
        );
    }

    #[cfg(unix)]
    #[test]
    fn keeps_everything_inside_the_override_folder_when_one_is_given_on_linux() {
        let paths = AppPaths::resolve(
            Some(Path::new("/tmp/test-data")),
            Path::new("/home/ada/.config"),
            Path::new("/home/ada/.local/share"),
        );

        assert_eq!(paths.config, Path::new("/tmp/test-data/config"));
        assert_eq!(paths.local, Path::new("/tmp/test-data/local"));
    }

    #[test]
    fn an_xdg_folder_is_the_variable_when_it_names_an_absolute_folder() {
        let home = std::env::temp_dir().join("ada");
        let elsewhere = std::env::temp_dir().join("config");

        assert_eq!(
            xdg_folder(Some(elsewhere.clone().into()), Some(&home), ".config"),
            elsewhere
        );
    }

    #[test]
    fn an_xdg_folder_is_in_the_home_folder_when_the_variable_is_missing_or_relative() {
        let home = std::env::temp_dir().join("ada");

        assert_eq!(
            xdg_folder(None, Some(&home), ".config"),
            home.join(".config")
        );
        assert_eq!(
            xdg_folder(Some("relative/config".into()), Some(&home), ".config"),
            home.join(".config")
        );
        assert_eq!(
            xdg_folder(Some(OsString::new()), Some(&home), ".local/share"),
            home.join(".local/share")
        );
    }
}
