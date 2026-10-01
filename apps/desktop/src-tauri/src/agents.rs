//! The commands for the agent programs: finding out which are installed.

use std::sync::Arc;

use arden_agents::detect::{self, Detection};
use arden_core::error::{AppError, ErrorCode};
use arden_process::supervisor::Supervisor;
use tauri::State;

/// The supervisor that starts programs for the app, when Windows let it be made.
pub struct Programs(pub Option<Arc<Supervisor>>);

impl Programs {
    fn supervisor(&self) -> Result<Arc<Supervisor>, AppError> {
        self.0
            .clone()
            .ok_or_else(|| AppError::new(ErrorCode::ProcessSupervisor))
    }
}

/// Looks for the Claude Code and Codex programs, and says where they are and which version. It
/// changes nothing. Asking each program for its version can take a moment, so it runs off the
/// thread of the window.
///
/// # Errors
///
/// Returns `ARD-PROC-001` when programs cannot be supervised on this computer, and an unexpected
/// error when the search itself could not run.
#[tauri::command]
#[specta::specta]
pub async fn detect_agents(programs: State<'_, Programs>) -> Result<Vec<Detection>, AppError> {
    let supervisor = programs.supervisor()?;
    tauri::async_runtime::spawn_blocking(move || detect::detect_all(&supervisor))
        .await
        .map_err(|error| AppError::new(ErrorCode::Unexpected).with_details(error.to_string()))
}

/// Starts a program that runs for a minute, in the job, and returns its process number. Tests use it
/// to see that a program ends when the app does. Debug builds only.
///
/// # Errors
///
/// Returns an error when the program cannot be started.
#[cfg(debug_assertions)]
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn debug_spawn_sleeper(programs: State<'_, Programs>) -> Result<u32, AppError> {
    use arden_process::command::Arg;
    use arden_process::resolve::resolve_from_environment;

    let supervisor = programs.supervisor()?;
    let ping = resolve_from_environment("ping")
        .ok_or_else(|| AppError::new(ErrorCode::Unexpected).with_details("ping was not found"))?;
    let started = supervisor
        .spawn(
            "sleeper",
            &ping,
            &[
                Arg::Literal("-n"),
                Arg::Literal("120"),
                Arg::Literal("127.0.0.1"),
            ],
        )
        .map_err(|error| {
            AppError::new(ErrorCode::ProcessSupervisor).with_details(error.to_string())
        })?;
    Ok(started.child.id())
}
