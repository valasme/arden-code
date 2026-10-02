//! Starting the app again: to finish a reset, for a setting that needs it, and when the web engine
//! is gone.
//!
//! A new start must not touch the app's files until the old one has ended, and with it everything
//! it started: its web engine goes on writing to its folder for a moment after the app has ended.
//! So the old start hands the new one its identity, and the new one waits for that whole tree
//! before anything else ([`wait_for_previous`]).
//!
//! Tauri's own restart is not used. It starts the new process from inside its event loop with
//! nothing handed over, and under `tauri dev` the process it ends is the one the dev server belongs
//! to (see `restarter`).

use std::io;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use arden_windows::process::{self, Identity};
use tauri::AppHandle;

use crate::restarter;

/// The variable that hands a new start the identity of the one it replaces.
const RESTARTED_FROM_VARIABLE: &str = "ARDEN_CODE_RESTARTED_FROM";

/// How long a new start waits for the old one. The web engine needs a fraction of a second; past
/// this, something holds on, and the app starts anyway.
const PATIENCE: Duration = Duration::from_secs(10);

/// Whether the app should start again once it has stopped.
static REQUESTED: AtomicBool = AtomicBool::new(false);

/// Stops the app and starts it again.
pub fn request(app: &AppHandle) {
    tracing::info!("Arden Code is starting again");
    REQUESTED.store(true, Ordering::Relaxed);
    app.exit(0);
}

/// Ends this process once the app has stopped, with `code`, or starts the app again when that was
/// asked for.
pub fn finish(code: i32) -> ! {
    if !REQUESTED.load(Ordering::Relaxed) {
        std::process::exit(code);
    }
    if restarter::runs_this() {
        // The restarter starts the app again once this process has ended.
        std::process::exit(restarter::RESTART_EXIT_CODE);
    }
    if let Err(error) = start_again() {
        tracing::error!(%error, "could not start Arden Code again");
    }
    std::process::exit(0);
}

/// Starts this program again, handing over this process's identity.
fn start_again() -> io::Result<()> {
    this_program_again(Some(Identity::current()?))?
        .spawn()
        .map(drop)
}

/// This program, with this process's arguments, to start again. `replaces` is the start it replaces,
/// which it waits for.
pub fn this_program_again(replaces: Option<Identity>) -> io::Result<Command> {
    let mut program = Command::new(std::env::current_exe()?);
    program.args(std::env::args_os().skip(1));
    if let Some(previous) = replaces {
        program.env(RESTARTED_FROM_VARIABLE, previous.to_string());
    }
    Ok(program)
}

/// When this start replaces another, waits for that one and everything it started to end. Returns
/// `None` when it replaces none, and otherwise whether they ended in time.
pub fn wait_for_previous() -> Option<bool> {
    let previous: Identity = std::env::var(RESTARTED_FROM_VARIABLE).ok()?.parse().ok()?;
    Some(process::wait_for_tree(previous, PATIENCE))
}
