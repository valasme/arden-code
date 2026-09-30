//! Building the command that starts a program, and refusing to build an unsafe one.
//!
//! When Windows starts a `.cmd` or `.bat` script it hands the arguments to `cmd.exe`, which reads
//! characters such as `&` and `%` as commands. A message a person typed, or text an agent
//! produced, could then run anything (a family of bugs with a name of its own, `BatBadBut`). So a script only ever gets
//! arguments that Arden Code wrote itself ([`Arg::Literal`]); text from anywhere else
//! ([`Arg::Untrusted`]) goes to real programs only.

use std::fmt;
use std::process::Command;

use crate::resolve::{ProgramKind, Resolved};

/// One argument for a program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Arg {
    /// Text written in Arden Code's own source, such as `--version`. Being a `&'static str`, it
    /// cannot have come from a person or an agent.
    Literal(&'static str),
    /// Text from a person, an agent or a file.
    Untrusted(String),
}

impl Arg {
    fn text(&self) -> &str {
        match self {
            Self::Literal(text) => text,
            Self::Untrusted(text) => text,
        }
    }
}

/// Why a program was not started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpawnError {
    /// The program was not found.
    NotFound,
    /// Untrusted text was meant for a script, which would read it as commands.
    UnsafeArguments,
    /// An argument holds a character that cannot be passed to a program.
    InvalidArgument,
    /// Windows could not start it, or the log file could not be made.
    Io(String),
}

impl fmt::Display for SpawnError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => formatter.write_str("the program was not found"),
            Self::UnsafeArguments => {
                formatter.write_str("untrusted arguments cannot be passed to a script")
            }
            Self::InvalidArgument => formatter.write_str("an argument holds a null character"),
            Self::Io(message) => write!(formatter, "the program could not be started: {message}"),
        }
    }
}

impl std::error::Error for SpawnError {}

/// The flag that stops Windows from opening a console window for a program with no window of its
/// own.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The command that starts the program with the arguments, or an error saying why it must not.
///
/// # Errors
///
/// Returns [`SpawnError::UnsafeArguments`] when a script would get an untrusted argument, and
/// [`SpawnError::InvalidArgument`] for an argument with a null character.
pub fn build(program: &Resolved, args: &[Arg]) -> Result<Command, SpawnError> {
    if args.iter().any(|arg| arg.text().contains('\0')) {
        return Err(SpawnError::InvalidArgument);
    }
    if program.kind == ProgramKind::Script
        && args.iter().any(|arg| matches!(arg, Arg::Untrusted(_)))
    {
        return Err(SpawnError::UnsafeArguments);
    }

    let mut command = Command::new(&program.path);
    command.args(args.iter().map(Arg::text));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn program(path: &str, kind: ProgramKind) -> Resolved {
        Resolved {
            path: PathBuf::from(path),
            kind,
        }
    }

    #[test]
    fn a_real_program_gets_any_arguments() {
        let claude = program(r"C:\bin\claude.exe", ProgramKind::Executable);

        let command = build(
            &claude,
            &[
                Arg::Literal("--print"),
                Arg::Untrusted("hello & calc.exe %PATH% \"quoted\"".into()),
            ],
        )
        .expect("a command");

        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args[0], "--print");
        assert_eq!(args[1], "hello & calc.exe %PATH% \"quoted\"");
    }

    #[test]
    fn a_script_gets_arguments_that_arden_code_wrote_itself() {
        let codex = program(r"C:\npm\codex.cmd", ProgramKind::Script);

        assert!(build(&codex, &[Arg::Literal("--version")]).is_ok());
        assert!(build(&codex, &[]).is_ok());
    }

    #[test]
    fn a_script_never_gets_untrusted_text() {
        let codex = program(r"C:\npm\codex.cmd", ProgramKind::Script);

        for text in ["hello", "a & b", "%COMSPEC%", "\"; calc; \"", ""] {
            assert!(
                matches!(
                    build(&codex, &[Arg::Literal("exec"), Arg::Untrusted(text.into())]),
                    Err(SpawnError::UnsafeArguments)
                ),
                "{text:?}"
            );
        }
    }

    #[test]
    fn a_null_character_is_refused_for_every_kind_of_program() {
        for kind in [ProgramKind::Executable, ProgramKind::Script] {
            let target = program(r"C:\bin\tool.exe", kind);

            assert!(matches!(
                build(&target, &[Arg::Untrusted("a\0b".into())]),
                Err(SpawnError::InvalidArgument | SpawnError::UnsafeArguments)
            ));
        }
        let exe = program(r"C:\bin\tool.exe", ProgramKind::Executable);
        assert_eq!(
            build(&exe, &[Arg::Untrusted("a\0b".into())]).err(),
            Some(SpawnError::InvalidArgument)
        );
    }
}
