//! The Playground: the built-in project, a real folder the app makes for itself.

use std::io;
use std::path::Path;

use crate::model::{Project, ProjectKind};

/// The Playground's id in the sidebar and in the session store.
pub const PLAYGROUND_ID: &str = "playground";

/// Creates the Playground folder when it is not there yet, and describes it.
///
/// # Errors
///
/// Returns an error when the folder cannot be created.
pub fn ensure(folder: &Path) -> io::Result<Project> {
    std::fs::create_dir_all(folder)?;
    Ok(describe(folder))
}

/// Describes the Playground without touching the disk.
#[must_use]
pub fn describe(folder: &Path) -> Project {
    Project {
        id: PLAYGROUND_ID.to_owned(),
        kind: ProjectKind::Playground,
        name: "Playground".to_owned(),
        path: folder.display().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_folder_on_the_first_launch_and_leaves_it_alone_after() {
        let root = tempfile::tempdir().expect("a temporary folder");
        let folder = root.path().join("local").join("playground");

        let project = ensure(&folder).expect("the folder is created");
        std::fs::write(folder.join("notes.txt"), "kept").expect("a file to keep");
        ensure(&folder).expect("a second launch");

        assert!(folder.is_dir());
        assert_eq!(project.id, PLAYGROUND_ID);
        assert_eq!(project.kind, ProjectKind::Playground);
        assert_eq!(project.path, folder.display().to_string());
        assert_eq!(
            std::fs::read_to_string(folder.join("notes.txt")).expect("the file"),
            "kept"
        );
    }
}
