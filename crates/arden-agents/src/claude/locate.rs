//! Finding the person's Claude Code and checking it is recent enough (ADR 0038).

use std::ffi::OsStr;
use std::io::Read;
use std::path::Path;

use arden_process::resolve::{self, ProgramKind, Resolved};

/// The oldest Claude Code the driver works with: everything it uses is documented by then.
pub const MINIMUM_VERSION: &str = "2.1.223";

/// Where npm's package keeps the program, from the folder of npm's `claude.cmd`.
const NPM_PROGRAM: &str = r"node_modules\@anthropic-ai\claude-code\bin\claude.exe";

/// Why there is no Claude Code to start.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Missing {
    NotInstalled,
    /// Only npm's `claude.cmd` is there, with no program behind it: `cmd.exe` would read a
    /// message passed to it as commands, so it is never started with one.
    NpmWrapperOnly,
}

/// Whether the file is a Windows program: every one starts with the letters `MZ`.
fn is_program(path: &Path) -> bool {
    let mut start = [0_u8; 2];
    std::fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut start))
        .is_ok_and(|()| &start == b"MZ")
}

/// Finds Claude Code in the folders of `search_path`: a real `claude.exe`, or, behind npm's
/// `claude.cmd`, the npm package's own program. The wrapper itself is never read.
///
/// # Errors
///
/// Says why there is none to start.
pub fn find(search_path: &OsStr, path_ext: &OsStr) -> Result<Resolved, Missing> {
    let found = resolve::resolve("claude", search_path, path_ext).ok_or(Missing::NotInstalled)?;
    if found.kind == ProgramKind::Executable {
        return Ok(found);
    }
    let program = found
        .path
        .parent()
        .map(|folder| folder.join(NPM_PROGRAM))
        .filter(|program| is_program(program))
        .ok_or(Missing::NpmWrapperOnly)?;
    Ok(Resolved {
        path: program,
        kind: ProgramKind::Executable,
    })
}

/// Finds Claude Code with the `PATH` and `PATHEXT` of this process.
///
/// # Errors
///
/// Says why there is none to start.
pub fn find_from_environment() -> Result<Resolved, Missing> {
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    let path_ext = std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    find(&search_path, &path_ext)
}

/// The numbers of a version such as `2.1.286` or `3.0.0-beta.1`, a missing part counting as
/// nothing.
fn numbers(version: &str) -> Option<[u64; 3]> {
    let plain = version.split(['-', '+']).next()?;
    let mut parts = plain.split('.').map(str::parse::<u64>);
    let major = parts.next()?.ok()?;
    let minor = parts.next()?.ok()?;
    let patch = parts.next().transpose().ok()?.unwrap_or(0);
    Some([major, minor, patch])
}

/// Whether a Claude Code version is [`MINIMUM_VERSION`] or later.
#[must_use]
pub fn recent_enough(version: &str) -> bool {
    match (numbers(version), numbers(MINIMUM_VERSION)) {
        (Some(version), Some(minimum)) => version >= minimum,
        _ => false,
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::fs;
    use std::path::Path;

    use arden_process::resolve::ProgramKind;

    use super::*;

    const PATH_EXT: &str = ".COM;.EXE;.BAT;.CMD";

    /// A file Windows would take for a program: it starts the way every Windows program does.
    fn program_at(path: &Path) {
        fs::create_dir_all(path.parent().expect("a folder")).expect("its folder");
        fs::write(path, b"MZ\x90\x00 a program").expect("a program");
    }

    #[test]
    fn a_real_claude_on_path_is_found_as_it_is() {
        let bin = tempfile::tempdir().expect("a folder");
        program_at(&bin.path().join("claude.exe"));

        assert_eq!(
            find(bin.path().as_os_str(), OsStr::new(PATH_EXT)),
            Ok(Resolved {
                path: bin.path().join("claude.exe"),
                kind: ProgramKind::Executable
            })
        );
    }

    #[test]
    fn npms_wrapper_is_followed_to_the_packages_own_program() {
        let npm = tempfile::tempdir().expect("a folder");
        fs::write(npm.path().join("claude.cmd"), "@echo off\r\n").expect("the wrapper");
        let real = npm
            .path()
            .join(r"node_modules\@anthropic-ai\claude-code\bin\claude.exe");
        program_at(&real);

        assert_eq!(
            find(npm.path().as_os_str(), OsStr::new(PATH_EXT)),
            Ok(Resolved {
                path: real,
                kind: ProgramKind::Executable
            })
        );
    }

    #[test]
    fn a_wrapper_with_no_program_behind_it_cannot_be_started_safely() {
        let npm = tempfile::tempdir().expect("a folder");
        fs::write(npm.path().join("claude.cmd"), "@echo off\r\n").expect("the wrapper");

        assert_eq!(
            find(npm.path().as_os_str(), OsStr::new(PATH_EXT)),
            Err(Missing::NpmWrapperOnly)
        );

        // npm puts a stand-in in its place until its install step runs.
        let placeholder = npm
            .path()
            .join(r"node_modules\@anthropic-ai\claude-code\bin\claude.exe");
        fs::create_dir_all(placeholder.parent().expect("a folder")).expect("its folder");
        fs::write(&placeholder, "echo the install step did not run").expect("a placeholder");

        assert_eq!(
            find(npm.path().as_os_str(), OsStr::new(PATH_EXT)),
            Err(Missing::NpmWrapperOnly)
        );
    }

    #[test]
    fn no_claude_at_all_is_not_installed() {
        let empty = tempfile::tempdir().expect("a folder");

        assert_eq!(
            find(empty.path().as_os_str(), OsStr::new(PATH_EXT)),
            Err(Missing::NotInstalled)
        );
    }

    #[test]
    fn claude_code_2_1_223_or_later_is_recent_enough() {
        for version in ["2.1.223", "2.1.286", "2.2.0", "3.0.0-beta.1", "2.10.0"] {
            assert!(recent_enough(version), "{version}");
        }
        for version in ["2.1.222", "2.0.999", "1.9.999", "2.1", "", "unknown"] {
            assert!(!recent_enough(version), "{version}");
        }
    }
}
