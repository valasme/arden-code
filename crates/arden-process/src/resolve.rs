//! Finding a program on `PATH` the way the platform does, with differences that keep it safe.
//!
//! Windows looks in the current folder first, so a program a project happens to contain can take
//! the place of the one the person installed. Here only the folders of `PATH` are searched, and
//! only absolute ones, on every platform. And Windows takes the first match in the order of
//! `PATHEXT`, which can be a `.cmd` script in one folder ahead of a real `.exe` in another; here a
//! real program wins. Linux has no extensions: a program is the file with its own name that the
//! person may run, as a shell finds it.

use std::ffi::{OsStr, OsString};
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

/// Finds `name` in the folders of `search_path` the way Linux does: a file with that very name,
/// which may be a link, that the person may run. Every such file gets its arguments as they are,
/// a script included, as no shell reads them. Returns nothing for a name that is a path.
#[must_use]
pub fn resolve_executable(name: &str, search_path: &OsStr) -> Option<Resolved> {
    if !is_bare_name(name) {
        return None;
    }
    std::env::split_paths(search_path)
        .filter(|folder| folder.is_absolute())
        .map(|folder| folder.join(name))
        .find(|candidate| may_run(candidate))
        .map(|path| Resolved {
            path,
            kind: ProgramKind::Executable,
        })
}

/// Whether the path is a file, or a link to one, that someone may run.
#[cfg(unix)]
fn may_run(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

/// Whether the path is a file. Only Unix records who may run one.
#[cfg(not(unix))]
fn may_run(path: &Path) -> bool {
    path.is_file()
}

/// How the platform turns a program's name into its file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Lookup {
    /// Windows: the name with each of the extensions `PATHEXT` lists ([`resolve`]).
    Extensions(OsString),
    /// Linux: the name itself, when the person may run it ([`resolve_executable`]).
    Executable,
}

impl Lookup {
    /// The lookup of the platform this runs on, with the `PATHEXT` of this process on Windows.
    #[must_use]
    pub fn of_this_platform() -> Self {
        if cfg!(windows) {
            Self::Extensions(
                std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into()),
            )
        } else {
            Self::Executable
        }
    }

    /// Finds `name` in the folders of `search_path`.
    #[must_use]
    pub fn find(&self, name: &str, search_path: &OsStr) -> Option<Resolved> {
        match self {
            Self::Extensions(path_ext) => resolve(name, search_path, path_ext),
            Self::Executable => resolve_executable(name, search_path),
        }
    }
}

/// Finds `name` with the `PATH` of this process, the way the platform does.
#[must_use]
pub fn resolve_from_environment(name: &str) -> Option<Resolved> {
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    Lookup::of_this_platform().find(name, &search_path)
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

    // Windows does not tell `claude.exe` from `CLAUDE.EXE`; Linux does.
    #[cfg(windows)]
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

    /// A folder with files that may be run, and others that may not.
    #[cfg(unix)]
    fn folder_with_programs(programs: &[&str], others: &[&str]) -> TempDir {
        use std::os::unix::fs::PermissionsExt;

        let folder = folder_with(others);
        for program in programs {
            let path = folder.path().join(program);
            fs::write(&path, "#!/bin/sh\n").expect("a program");
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("runnable");
        }
        folder
    }

    #[cfg(unix)]
    #[test]
    fn linux_finds_a_program_by_its_own_name() {
        let bin = folder_with_programs(&["claude"], &[]);

        let found = resolve_executable("claude", &search(&[bin.path()]));

        assert_eq!(
            found,
            Some(Resolved {
                path: bin.path().join("claude"),
                kind: ProgramKind::Executable
            })
        );
    }

    #[cfg(unix)]
    #[test]
    fn linux_skips_a_file_nobody_may_run_for_a_program_in_a_later_folder() {
        let first = folder_with_programs(&[], &["claude"]);
        let second = folder_with_programs(&["claude"], &[]);

        let found = resolve_executable("claude", &search(&[first.path(), second.path()]));

        assert_eq!(
            found.map(|found| found.path),
            Some(second.path().join("claude"))
        );
    }

    #[cfg(unix)]
    #[test]
    fn linux_follows_a_link_to_a_program_as_npm_installs_one() {
        let package = folder_with_programs(&["cli.js"], &[]);
        let bin = tempfile::tempdir().expect("a temporary folder");
        std::os::unix::fs::symlink(package.path().join("cli.js"), bin.path().join("claude"))
            .expect("a link");

        let found = resolve_executable("claude", &search(&[bin.path()]));

        assert_eq!(
            found.map(|found| found.path),
            Some(bin.path().join("claude"))
        );
    }

    #[cfg(unix)]
    #[test]
    fn linux_never_takes_a_folder_or_a_name_that_is_a_path() {
        let bin = folder_with_programs(&[], &[]);
        fs::create_dir(bin.path().join("claude")).expect("a folder");
        let path = search(&[bin.path()]);

        assert_eq!(resolve_executable("claude", &path), None);
        for name in ["", ".", "..", "sub/claude", "../claude", "claude\n"] {
            assert_eq!(resolve_executable(name, &path), None, "{name:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn linux_never_searches_a_relative_folder() {
        assert_eq!(resolve_executable("sh", OsStr::new(".:bin")), None);
    }

    #[test]
    fn each_platform_looks_its_own_way() {
        let lookup = Lookup::of_this_platform();

        if cfg!(windows) {
            assert!(matches!(lookup, Lookup::Extensions(_)));
        } else {
            assert_eq!(lookup, Lookup::Executable);
        }
    }

    #[test]
    fn the_windows_lookup_uses_the_extensions_it_was_given() {
        let bin = folder_with(&["claude.cmd"]);

        let found = Lookup::Extensions(".CMD".into()).find("claude", &search(&[bin.path()]));

        assert_eq!(found.map(|found| found.kind), Some(ProgramKind::Script));
    }
}
