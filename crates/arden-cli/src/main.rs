//! The `arden-code` terminal command. The work is in the library.

use std::io::Write;
use std::process::ExitCode;

fn main() -> ExitCode {
    let working_dir = std::env::current_dir().unwrap_or_default();
    let outcome = arden_cli::run(std::env::args_os().skip(1), &working_dir);
    if !outcome.stdout.is_empty() {
        let _ = writeln!(std::io::stdout(), "{}", outcome.stdout.trim_end());
    }
    if !outcome.stderr.is_empty() {
        let _ = writeln!(std::io::stderr(), "{}", outcome.stderr.trim_end());
    }
    ExitCode::from(u8::try_from(outcome.exit_code).unwrap_or(1))
}
