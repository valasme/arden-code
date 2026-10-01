//! Saving the window's state to a file and reading it back.

use std::fs;
use std::io;
use std::path::Path;

use crate::placement::WindowState;

/// Reads the saved state. A missing, damaged or nonsensical file means "nothing saved": the window
/// then opens at its default place, and the next save replaces the bad file.
#[must_use]
pub fn load(path: &Path) -> Option<WindowState> {
    let text = fs::read_to_string(path).ok()?;
    let state: WindowState = serde_json::from_str(&text).ok()?;
    let sensible = state.width > 0
        && state.height > 0
        && state.scale_factor.is_finite()
        && state.scale_factor > 0.0;
    sensible.then_some(state)
}

/// Writes the state safely: to a temporary file first, then renamed over the real one, so a crash
/// mid-write cannot leave a half-written file.
///
/// # Errors
///
/// Returns an error when the folder or file cannot be written.
pub fn save(path: &Path, state: &WindowState) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(state)?)?;
    fs::rename(&temporary, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::placement::WindowState;

    fn sample() -> WindowState {
        WindowState {
            x: -300,
            y: 40,
            width: 1400,
            height: 900,
            scale_factor: 1.25,
            maximized: true,
        }
    }

    #[test]
    fn saved_state_is_read_back_unchanged() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("window-state.json");

        save(&path, &sample()).unwrap();

        assert_eq!(load(&path), Some(sample()));
    }

    #[test]
    fn creates_missing_folders() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join("a")
            .join("b")
            .join("window-state.json");

        save(&path, &sample()).unwrap();

        assert_eq!(load(&path), Some(sample()));
    }

    #[test]
    fn a_missing_file_means_no_saved_state() {
        let directory = tempfile::tempdir().unwrap();

        assert_eq!(load(&directory.path().join("nothing.json")), None);
    }

    #[test]
    fn a_damaged_file_is_ignored_instead_of_crashing_the_app() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("window-state.json");
        std::fs::write(&path, "{ this is not json").unwrap();

        assert_eq!(load(&path), None);
    }

    #[test]
    fn a_file_with_impossible_values_is_ignored() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("window-state.json");
        std::fs::write(
            &path,
            r#"{"x":0,"y":0,"width":0,"height":900,"scale_factor":1.0,"maximized":false}"#,
        )
        .unwrap();

        assert_eq!(load(&path), None);
    }

    #[test]
    fn saving_replaces_the_old_state_and_leaves_no_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("window-state.json");
        save(&path, &sample()).unwrap();
        let newer = WindowState { x: 5, ..sample() };

        save(&path, &newer).unwrap();

        assert_eq!(load(&path), Some(newer));
        let files: Vec<_> = std::fs::read_dir(directory.path()).unwrap().collect();
        assert_eq!(files.len(), 1);
    }
}
