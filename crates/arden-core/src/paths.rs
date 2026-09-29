//! Where Arden Code keeps its files.

use std::path::{Path, PathBuf};

use crate::APP_IDENTIFIER;

/// The environment variable that moves all of Arden Code's data into one folder. It exists for
/// automated tests, so they never touch a real user's settings, and for portable setups.
pub const DATA_DIR_VARIABLE: &str = "ARDEN_CODE_DATA_DIR";

/// The folders for the app's files: settings live in `config`, logs, crash reports and caches in
/// `local`. Nothing is created until something is written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    /// `%APPDATA%\io.github.valasme.arden`: settings and other files that follow the user.
    pub config: PathBuf,
    /// `%LOCALAPPDATA%\io.github.valasme.arden`: logs, crash reports and caches.
    pub local: PathBuf,
}

impl AppPaths {
    /// Works out the folders from Windows' roaming and local data folders, unless `data_dir` is
    /// given, in which case everything lives inside it.
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

    /// The saved window position and size.
    #[must_use]
    pub fn window_state_file(&self) -> PathBuf {
        self.config.join("window-state.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_windows_data_folders_and_the_app_identifier() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.config,
            Path::new(r"C:\Roaming\io.github.valasme.arden")
        );
        assert_eq!(paths.local, Path::new(r"C:\Local\io.github.valasme.arden"));
    }

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

    #[test]
    fn puts_the_window_state_next_to_the_settings() {
        let paths = AppPaths::resolve(None, Path::new(r"C:\Roaming"), Path::new(r"C:\Local"));

        assert_eq!(
            paths.window_state_file(),
            Path::new(r"C:\Roaming\io.github.valasme.arden\window-state.json")
        );
    }
}
