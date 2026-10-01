//! What the app was asked to do when it was started: at this time, open a folder as a project.
//!
//! The `arden-code` terminal command starts the app with `--open <folder>`. When the app is already
//! running, its single-instance mechanism hands those arguments to the running copy.

use std::path::{Path, PathBuf};

/// Removes the `\\?\` prefix that `canonicalize` puts on a path.
fn plain(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

/// The folder to open, when the arguments ask for one and it exists. A relative path is read from
/// `working_dir`, the folder the copy that was started second was started in.
#[must_use]
pub fn folder_to_open(arguments: &[String], working_dir: Option<&Path>) -> Option<PathBuf> {
    let position = arguments.iter().position(|argument| argument == "--open")?;
    let given = Path::new(arguments.get(position + 1)?);
    let full = if given.is_absolute() {
        given.to_path_buf()
    } else {
        working_dir?.join(given)
    };
    let folder = full.canonicalize().ok()?;
    folder.is_dir().then(|| plain(&folder))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(list: &[&str]) -> Vec<String> {
        list.iter().map(|text| (*text).to_owned()).collect()
    }

    #[test]
    fn asks_for_the_folder_after_open() {
        let root = tempfile::tempdir().expect("a temporary folder");
        let folder = root.path().canonicalize().expect("a path");

        let found = folder_to_open(
            &arguments(&[
                "arden-code.exe",
                "--open",
                root.path().to_str().expect("text"),
            ]),
            None,
        );

        assert_eq!(found, Some(plain(&folder)));
    }

    #[test]
    fn reads_a_relative_folder_from_the_folder_the_second_copy_was_started_in() {
        let root = tempfile::tempdir().expect("a temporary folder");
        std::fs::create_dir(root.path().join("project")).expect("a folder");

        let found = folder_to_open(&arguments(&["--open", "project"]), Some(root.path()));

        assert_eq!(
            found,
            Some(plain(
                &root.path().join("project").canonicalize().expect("a path")
            ))
        );
        assert_eq!(
            folder_to_open(&arguments(&["--open", "project"]), None),
            None
        );
    }

    #[test]
    fn asks_for_nothing_without_open_or_for_a_folder_that_is_not_there() {
        let root = tempfile::tempdir().expect("a temporary folder");
        std::fs::write(root.path().join("file.txt"), "x").expect("a file");

        assert_eq!(folder_to_open(&arguments(&["arden-code.exe"]), None), None);
        assert_eq!(folder_to_open(&arguments(&["--open"]), None), None);
        assert_eq!(
            folder_to_open(&arguments(&["--open", "nowhere"]), Some(root.path())),
            None
        );
        assert_eq!(
            folder_to_open(&arguments(&["--open", "file.txt"]), Some(root.path())),
            None,
            "a file is not a folder"
        );
    }

    #[test]
    fn the_path_has_no_verbatim_prefix() {
        let root = tempfile::tempdir().expect("a temporary folder");

        let found = folder_to_open(
            &arguments(&["--open", root.path().to_str().expect("text")]),
            None,
        )
        .expect("a folder");

        assert!(!found.to_string_lossy().starts_with(r"\\?\"));
    }
}
