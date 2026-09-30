//! The `arden-code` terminal command (ADR 0021).
//!
//! The app is a window program: started from a terminal it cannot print to it. This small console
//! program can. Installed as `bin\arden-code.exe` and put on the user's `PATH`, it opens the app
//! (or brings the open one forward), opens a folder as a project, and prints its version and help.
//!
//! It never does the work itself: it starts the app with `--open <folder>`, and the app's
//! single-instance mechanism hands that to the copy that is already running, if there is one.

pub mod path_env;
pub mod path_list;

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The name of the environment variable that tells the command where the app is. Tests use it;
/// an installed command finds the app next to its own folder.
pub const APP_VARIABLE: &str = "ARDEN_CODE_APP";

/// What the person asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Request {
    /// Open the app, or bring it forward.
    OpenApp,
    /// Open a folder as a project.
    OpenFolder(PathBuf),
    /// Print the version.
    Version,
    /// Print the help.
    Help,
    /// Used by the installer: put the command's folder on the user's `PATH`.
    AddToPath,
    /// Used by the installer: take the command's folder off the user's `PATH`.
    RemoveFromPath,
}

/// Why the arguments were refused, with what to tell the person and the exit code to end with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub message: String,
    pub exit_code: i32,
}

/// The help text.
#[must_use]
pub fn help() -> String {
    format!(
        "arden-code {version}\n\
         \n\
         Opens Arden Code, or a folder as a project, from the terminal.\n\
         \n\
         USAGE:\n\
         \x20   arden-code              Open Arden Code, or bring it forward\n\
         \x20   arden-code <FOLDER>     Open a folder as a project (arden-code . for this one)\n\
         \n\
         OPTIONS:\n\
         \x20   -h, --help              Print this help\n\
         \x20   -V, --version           Print the version\n",
        version = env!("CARGO_PKG_VERSION")
    )
}

/// The version line.
#[must_use]
pub fn version() -> String {
    format!("arden-code {}", env!("CARGO_PKG_VERSION"))
}

/// Removes the `\\?\` prefix that `canonicalize` puts on a path, which programs other than Rust
/// often cannot read. A network path (`\\?\UNC\server\share`) becomes `\\server\share`.
#[must_use]
pub fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

/// The folder an argument names, as a full path, when it exists and is a folder.
fn folder(argument: &OsString, working_dir: &Path) -> Result<PathBuf, Refusal> {
    let given = Path::new(argument);
    let full = if given.is_absolute() {
        given.to_path_buf()
    } else {
        working_dir.join(given)
    };
    match full.canonicalize() {
        Ok(path) if path.is_dir() => Ok(plain_path(&path)),
        Ok(_) => Err(Refusal {
            message: format!("arden-code: {} is not a folder", given.display()),
            exit_code: 1,
        }),
        Err(_) => Err(Refusal {
            message: format!("arden-code: the folder {} does not exist", given.display()),
            exit_code: 1,
        }),
    }
}

/// Reads the arguments the command was started with.
///
/// # Errors
///
/// Returns a [`Refusal`] for an option that does not exist, more than one folder, or a folder that
/// does not exist.
pub fn parse(
    arguments: impl IntoIterator<Item = OsString>,
    working_dir: &Path,
) -> Result<Request, Refusal> {
    let mut request = Request::OpenApp;
    let mut folder_seen = false;
    for argument in arguments {
        match argument.to_str() {
            Some("-h" | "--help") => return Ok(Request::Help),
            Some("-V" | "--version") => return Ok(Request::Version),
            Some("--add-to-path") => return Ok(Request::AddToPath),
            Some("--remove-from-path") => return Ok(Request::RemoveFromPath),
            Some(option) if option.starts_with('-') && option.len() > 1 => {
                return Err(Refusal {
                    message: format!(
                        "arden-code: unknown option {option}\nTry 'arden-code --help'."
                    ),
                    exit_code: 2,
                });
            }
            _ if folder_seen => {
                return Err(Refusal {
                    message: "arden-code: only one folder can be opened at a time".to_owned(),
                    exit_code: 2,
                });
            }
            _ => {
                request = Request::OpenFolder(folder(&argument, working_dir)?);
                folder_seen = true;
            }
        }
    }
    Ok(request)
}

/// Where the app is: next to the folder this command lives in (`bin\arden-code.exe` and
/// `arden-code.exe`), or where [`APP_VARIABLE`] says.
///
/// # Errors
///
/// Returns an error when the command cannot tell where it is.
pub fn app_path() -> io::Result<PathBuf> {
    if let Some(path) = std::env::var_os(APP_VARIABLE) {
        return Ok(PathBuf::from(path));
    }
    let own = std::env::current_exe()?;
    own.parent()
        .and_then(Path::parent)
        .map(|install| install.join("arden-code.exe"))
        .ok_or_else(|| io::Error::other("the command is not inside the app's folder"))
}

/// Starts the app, apart from this terminal, with a folder to open when there is one. A copy that
/// is already running gets the folder instead, through its single-instance mechanism.
///
/// # Errors
///
/// Returns an error when the app cannot be started.
pub fn launch(app: &Path, folder: Option<&Path>) -> io::Result<()> {
    let mut command = Command::new(app);
    if let Some(folder) = folder {
        command.arg("--open").arg(folder);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // The app must outlive the terminal, and must not take its console.
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    command.spawn().map(drop)
}

/// Runs the command with the given arguments. Says what to print and how to end.
#[must_use]
pub fn run(arguments: impl IntoIterator<Item = OsString>, working_dir: &Path) -> Outcome {
    let request = match parse(arguments, working_dir) {
        Ok(request) => request,
        Err(refusal) => {
            return Outcome {
                stdout: String::new(),
                stderr: refusal.message,
                exit_code: refusal.exit_code,
            };
        }
    };
    let done = |stdout: String| Outcome {
        stdout,
        stderr: String::new(),
        exit_code: 0,
    };
    let failed = |error: &dyn std::fmt::Display| Outcome {
        stdout: String::new(),
        stderr: format!("arden-code: {error}"),
        exit_code: 1,
    };
    match request {
        Request::Help => done(help()),
        Request::Version => done(version()),
        Request::OpenApp | Request::OpenFolder(_) => {
            let folder = match &request {
                Request::OpenFolder(path) => Some(path.as_path()),
                _ => None,
            };
            match app_path().and_then(|app| launch(&app, folder)) {
                Ok(()) => done(String::new()),
                Err(error) => failed(&format!("could not start Arden Code: {error}")),
            }
        }
        Request::AddToPath | Request::RemoveFromPath => {
            let own = match std::env::current_exe() {
                Ok(path) => path,
                Err(error) => return failed(&error),
            };
            let Some(folder) = own.parent() else {
                return failed(&"the command is not inside a folder");
            };
            let result = if request == Request::AddToPath {
                path_env::add_to_user_path(folder)
            } else {
                path_env::remove_from_user_path(folder)
            };
            match result {
                Ok(()) => done(String::new()),
                Err(error) => failed(&format!("could not change the PATH: {error}")),
            }
        }
    }
}

/// What a run of the command prints, and how it ends.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    #[test]
    fn no_arguments_opens_the_app() {
        assert_eq!(parse(args(&[]), Path::new(".")), Ok(Request::OpenApp));
    }

    #[test]
    fn version_and_help_are_asked_for_in_both_spellings() {
        for flag in ["-V", "--version"] {
            assert_eq!(parse(args(&[flag]), Path::new(".")), Ok(Request::Version));
        }
        for flag in ["-h", "--help"] {
            assert_eq!(parse(args(&[flag]), Path::new(".")), Ok(Request::Help));
        }
    }

    #[test]
    fn a_folder_is_opened_by_its_full_path_wherever_it_was_named_from() {
        let root = tempfile::tempdir().expect("a temporary folder");
        fs::create_dir(root.path().join("project")).expect("a folder");

        let by_name = parse(args(&["project"]), root.path()).expect("a request");
        let by_dot = parse(args(&["."]), &root.path().join("project")).expect("a request");
        let by_full = parse(
            args(&[root.path().join("project").to_str().expect("text")]),
            Path::new("."),
        )
        .expect("a request");

        let expected = plain_path(&root.path().join("project").canonicalize().expect("a path"));
        assert_eq!(by_name, Request::OpenFolder(expected.clone()));
        assert_eq!(by_dot, Request::OpenFolder(expected.clone()));
        assert_eq!(by_full, Request::OpenFolder(expected));
    }

    #[test]
    fn a_folder_path_has_no_verbatim_prefix() {
        let root = tempfile::tempdir().expect("a temporary folder");

        let Ok(Request::OpenFolder(path)) = parse(args(&["."]), root.path()) else {
            panic!("a folder request");
        };

        assert!(
            !path.to_string_lossy().starts_with(r"\\?\"),
            "{}",
            path.display()
        );
    }

    #[test]
    fn a_folder_that_is_missing_or_is_a_file_is_refused_with_exit_code_1() {
        let root = tempfile::tempdir().expect("a temporary folder");
        fs::write(root.path().join("file.txt"), "x").expect("a file");

        let missing = parse(args(&["nowhere"]), root.path()).expect_err("refused");
        let file = parse(args(&["file.txt"]), root.path()).expect_err("refused");

        assert_eq!(missing.exit_code, 1);
        assert!(
            missing.message.contains("does not exist"),
            "{}",
            missing.message
        );
        assert_eq!(file.exit_code, 1);
        assert!(file.message.contains("is not a folder"), "{}", file.message);
    }

    #[test]
    fn an_unknown_option_and_a_second_folder_are_refused_with_exit_code_2() {
        let root = tempfile::tempdir().expect("a temporary folder");
        fs::create_dir(root.path().join("a")).expect("a folder");
        fs::create_dir(root.path().join("b")).expect("a folder");

        let unknown = parse(args(&["--frobnicate"]), root.path()).expect_err("refused");
        let two = parse(args(&["a", "b"]), root.path()).expect_err("refused");

        assert_eq!(unknown.exit_code, 2);
        assert!(unknown.message.contains("--frobnicate") && unknown.message.contains("--help"));
        assert_eq!(two.exit_code, 2);
    }

    #[test]
    fn a_name_that_starts_with_a_dash_is_an_option_not_a_folder() {
        let root = tempfile::tempdir().expect("a temporary folder");
        fs::create_dir(root.path().join("-odd")).expect("a folder");

        assert!(parse(args(&["-odd"]), root.path()).is_err());
    }

    #[test]
    fn help_and_version_say_what_the_command_is() {
        assert!(help().contains("arden-code <FOLDER>"));
        assert!(help().contains("--version"));
        assert_eq!(
            version(),
            format!("arden-code {}", env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn asking_for_the_version_prints_it_and_ends_well() {
        let outcome = run(args(&["--version"]), Path::new("."));

        assert_eq!(outcome.exit_code, 0);
        assert_eq!(outcome.stdout, version());
        assert_eq!(outcome.stderr, "");
    }

    #[test]
    fn a_refusal_prints_to_the_error_stream() {
        let outcome = run(args(&["--what"]), Path::new("."));

        assert_eq!(outcome.exit_code, 2);
        assert_eq!(outcome.stdout, "");
        assert!(outcome.stderr.contains("unknown option"));
    }

    #[test]
    fn the_verbatim_prefix_is_taken_off_local_and_network_paths() {
        assert_eq!(
            plain_path(Path::new(r"\\?\C:\Users\Ada")),
            Path::new(r"C:\Users\Ada")
        );
        assert_eq!(
            plain_path(Path::new(r"\\?\UNC\server\share\dir")),
            Path::new(r"\\server\share\dir")
        );
        assert_eq!(
            plain_path(Path::new(r"C:\Users\Ada")),
            Path::new(r"C:\Users\Ada")
        );
    }
}
