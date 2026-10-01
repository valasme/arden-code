//! Finding a program on `PATH` the way Windows does, with two differences that keep it safe.
//!
//! Windows looks in the current folder first, so a program a project happens to contain can take
//! the place of the one the person installed. Here only the folders of `PATH` are searched, and
//! only absolute ones. And Windows takes the first match in the order of `PATHEXT`, which can be a
//! `.cmd` script in one folder ahead of a real `.exe` in another; here a real program wins.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// What a program file is, which decides how it may be started.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgramKind {
    /// A real program (`.exe`, `.com`): it gets its arguments as they are.
    Executable,
    /// A script that `cmd.exe` runs (`.cmd`, `.bat`): it reads its arguments as commands, so it
    /// may only be given text that Arden Code wrote itself.
    Script,
}

/// A program that was found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub path: PathBuf,
    pub kind: ProgramKind,
}

/// The kinds of file that are started, from the most to the least preferred. Script hosts such as
/// `.vbs` and `.js` are in `PATHEXT` too, and are never started.
const PREFERENCE: [(&str, ProgramKind); 4] = [
    ("exe", ProgramKind::Executable),
    ("com", ProgramKind::Executable),
    ("cmd", ProgramKind::Script),
    ("bat", ProgramKind::Script),
];

/// Whether the name is only a name: not a path, and not empty.
fn is_bare_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['/', '\\', ':'])
        && name != "."
        && name != ".."
        && !name.chars().any(char::is_control)
}

/// The extensions `PATHEXT` lists, lower case and without the dot.
fn listed_extensions(path_ext: &OsStr) -> Vec<String> {
    path_ext
        .to_string_lossy()
        .split(';')
        .map(|extension| {
            extension
                .trim()
                .trim_start_matches('.')
                .to_ascii_lowercase()
        })
        .filter(|extension| !extension.is_empty())
        .collect()
}

/// Finds `name` in the folders of `search_path`, using the extensions `path_ext` lists.
///
/// A name that already ends in a listed extension (`claude.exe`) is looked for as it is; any other
/// name gets each extension in turn. Returns nothing for a name that is a path.
#[must_use]
pub fn resolve(name: &str, search_path: &OsStr, path_ext: &OsStr) -> Option<Resolved> {
    if !is_bare_name(name) {
        return None;
    }
    let folders: Vec<PathBuf> = std::env::split_paths(search_path)
        .filter(|folder| folder.is_absolute())
        .collect();
    let extensions = listed_extensions(path_ext);
    let lower = name.to_ascii_lowercase();

    for (extension, kind) in PREFERENCE {
        if !extensions.iter().any(|listed| listed == extension) {
            continue;
        }
        let dotted = format!(".{extension}");
        // The name as given, when it already has this extension; otherwise with it added.
        let file_name = if lower.ends_with(&dotted) {
            name.to_owned()
        } else {
            format!("{name}{dotted}")
        };
        for folder in &folders {
            let candidate = folder.join(&file_name);
            if candidate.is_file() {
                return Some(Resolved {
                    path: candidate,
                    kind,
                });
            }
        }
    }
    None
}

/// Finds `name` with the `PATH` and `PATHEXT` of this process.
#[must_use]
pub fn resolve_from_environment(name: &str) -> Option<Resolved> {
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    let path_ext = std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    resolve(name, &search_path, &path_ext)
}

/// Whether the path names a script that `cmd.exe` would run.
#[must_use]
pub fn is_script(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        })
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    const PATHEXT: &str = ".COM;.EXE;.BAT;.CMD;.VBS;.JS";

    fn folder_with(files: &[&str]) -> TempDir {
        let folder = tempfile::tempdir().expect("a temporary folder");
        for file in files {
            fs::write(folder.path().join(file), "").expect("a file");
        }
        folder
    }

    fn search(folders: &[&Path]) -> OsString {
        std::env::join_paths(folders).expect("folders that can be joined")
    }

    #[test]
    fn finds_a_program_by_its_name_without_the_extension() {
        let bin = folder_with(&["claude.exe"]);

        let found = resolve("claude", &search(&[bin.path()]), OsStr::new(PATHEXT));

        assert_eq!(
            found,
            Some(Resolved {
                path: bin.path().join("claude.exe"),
                kind: ProgramKind::Executable
            })
        );
    }

    #[test]
    fn finds_a_program_by_its_full_name() {
        let bin = folder_with(&["claude.exe"]);

        let found = resolve("claude.exe", &search(&[bin.path()]), OsStr::new(PATHEXT));

        assert_eq!(
            found.map(|found| found.path),
            Some(bin.path().join("claude.exe"))
        );
    }

    #[test]
    fn a_real_program_wins_over_a_script_even_in_a_later_folder() {
        let npm = folder_with(&["codex.cmd"]);
        let local = folder_with(&["codex.exe"]);

        let found = resolve(
            "codex",
            &search(&[npm.path(), local.path()]),
            OsStr::new(PATHEXT),
        )
        .expect("a program");

        assert_eq!(found.path, local.path().join("codex.exe"));
        assert_eq!(found.kind, ProgramKind::Executable);
    }

    #[test]
    fn a_script_is_found_when_there_is_nothing_better_and_is_marked_as_one() {
        let npm = folder_with(&["codex.cmd"]);

        let found =
            resolve("codex", &search(&[npm.path()]), OsStr::new(PATHEXT)).expect("a script");

        assert_eq!(found.path, npm.path().join("codex.cmd"));
        assert_eq!(found.kind, ProgramKind::Script);
    }

    #[test]
    fn earlier_folders_win_between_programs_of_the_same_kind() {
        let first = folder_with(&["claude.exe"]);
        let second = folder_with(&["claude.exe"]);

        let found = resolve(
            "claude",
            &search(&[first.path(), second.path()]),
            OsStr::new(PATHEXT),
        )
        .expect("a program");

        assert_eq!(found.path, first.path().join("claude.exe"));
    }

    #[test]
    fn extensions_are_read_without_regard_to_case() {
        let bin = folder_with(&["claude.exe"]);

        assert!(resolve("CLAUDE", &search(&[bin.path()]), OsStr::new(".exe;.cmd")).is_some());
        assert!(resolve("claude", &search(&[bin.path()]), OsStr::new(".EXE")).is_some());
    }

    #[test]
    fn only_the_extensions_that_pathext_lists_are_tried() {
        let bin = folder_with(&["claude.exe"]);

        assert_eq!(
            resolve("claude", &search(&[bin.path()]), OsStr::new(".cmd;.bat")),
            None
        );
    }

    #[test]
    fn script_hosts_are_never_started_even_when_listed() {
        let bin = folder_with(&["claude.vbs", "claude.js", "claude.ps1"]);

        assert_eq!(
            resolve("claude", &search(&[bin.path()]), OsStr::new(PATHEXT)),
            None
        );
    }

    #[test]
    fn a_missing_program_is_not_found() {
        let bin = folder_with(&["other.exe"]);

        assert_eq!(
            resolve("claude", &search(&[bin.path()]), OsStr::new(PATHEXT)),
            None
        );
    }

    #[test]
    fn a_relative_folder_is_not_searched() {
        // "." would be the folder of whatever project is open.
        assert_eq!(
            resolve("cmd", OsStr::new(".;bin"), OsStr::new(PATHEXT)),
            None
        );
    }

    #[test]
    fn a_name_that_is_a_path_is_not_resolved() {
        let bin = folder_with(&["claude.exe"]);
        let path = search(&[bin.path()]);
        let full = bin.path().join("claude.exe").display().to_string();

        for name in [
            full.as_str(),
            "..\\claude",
            "sub/claude",
            "C:claude",
            "",
            ".",
            "..",
            "claude\n",
        ] {
            assert_eq!(resolve(name, &path, OsStr::new(PATHEXT)), None, "{name:?}");
        }
    }

    #[test]
    fn scripts_are_recognised_by_their_extension() {
        assert!(is_script(Path::new(r"C:\npm\codex.cmd")));
        assert!(is_script(Path::new(r"C:\npm\CODEX.BAT")));
        assert!(!is_script(Path::new(r"C:\bin\codex.exe")));
        assert!(!is_script(Path::new(r"C:\bin\codex")));
    }
}
