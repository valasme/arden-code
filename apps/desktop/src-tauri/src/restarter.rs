//! The restarter of a development build.
//!
//! `tauri dev` runs the app and serves its pages, and stops serving them when the process it ran
//! ends. An app that started itself again would end that process and leave the new one with no
//! pages. So in a development build, the process `tauri dev` runs is the restarter: it runs the app
//! as its child, and runs it again each time the app exits asking for that (see `restart`).

use std::io;
use std::process::Child;

use arden_windows::process::Identity;

use crate::restart;

/// The exit code with which the app asks the restarter to run it again.
pub const RESTART_EXIT_CODE: i32 = tauri::RESTART_EXIT_CODE;

/// The variable that tells the app that the restarter runs it.
const RESTARTER_VARIABLE: &str = "ARDEN_CODE_RESTARTER";

/// Whether this process should be the restarter: it is a development build, and no restarter runs
/// it.
pub fn wanted() -> bool {
    tauri::is_dev() && std::env::var_os(RESTARTER_VARIABLE).is_none()
}

/// Whether this process is the app, run by the restarter.
pub fn runs_this() -> bool {
    tauri::is_dev() && std::env::var_os(RESTARTER_VARIABLE).is_some()
}

/// Runs the app under this restarter, with this process's arguments, and ends with its exit code.
pub fn run() -> ! {
    let code = supervise(|previous| {
        restart::this_program_again(previous)?
            .env(RESTARTER_VARIABLE, "1")
            .spawn()
    })
    .unwrap_or_else(|error| {
        eprintln!("Arden Code's restarter could not run the app: {error}");
        1
    });
    std::process::exit(code)
}

/// Runs the app with `start` until it exits for a reason other than to start again, and returns
/// that exit code. Each new run is handed the identity of the one before, which it waits for.
///
/// # Errors
///
/// Returns an error when the app cannot be started, or waited for.
pub fn supervise(mut start: impl FnMut(Option<Identity>) -> io::Result<Child>) -> io::Result<i32> {
    let mut previous = None;
    loop {
        let mut app = start(previous)?;
        let code = app.wait()?.code().unwrap_or(1);
        if code != RESTART_EXIT_CODE {
            return Ok(code);
        }
        previous = Some(Identity::of(&app)?);
    }
}

#[cfg(test)]
mod tests {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    use super::*;

    /// A stand-in for the app that exits with `code`.
    fn exits_with(code: i32) -> io::Result<Child> {
        Command::new("cmd")
            .raw_arg(format!("/c exit {code}"))
            .spawn()
    }

    #[test]
    fn the_app_runs_again_each_time_it_asks_and_its_last_exit_code_is_kept() {
        let mut codes = [RESTART_EXIT_CODE, RESTART_EXIT_CODE, 3].into_iter();
        let mut runs: Vec<(u32, Option<Identity>)> = Vec::new();

        let code = supervise(|previous| {
            let app = exits_with(codes.next().expect("no more runs"))?;
            runs.push((app.id(), previous));
            Ok(app)
        })
        .unwrap();

        assert_eq!(code, 3);
        assert_eq!(runs.len(), 3);
        assert_eq!(runs[0].1, None, "the first run follows nothing");
        assert_eq!(runs[1].1.map(|before| before.id), Some(runs[0].0));
        assert_eq!(runs[2].1.map(|before| before.id), Some(runs[1].0));
    }
}
