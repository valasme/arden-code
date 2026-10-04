//! The commands for the agent programs: finding out which are installed.

use std::sync::{Arc, Mutex, PoisonError};

use arden_agents::claude::driver::ClaudeDriver;
use arden_agents::claude::launch::{Connection, LaunchError, Launcher, ProgramLauncher, Start};
use arden_agents::detect::{self, AgentCli, Detection};
use arden_core::error::{AppError, ErrorCode};
use arden_process::supervisor::Supervisor;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

/// The supervisor that starts programs for the app, when Windows let it be made.
pub struct Programs(pub Option<Arc<Supervisor>>);

impl Programs {
    fn supervisor(&self) -> Result<Arc<Supervisor>, AppError> {
        self.0
            .clone()
            .ok_or_else(|| AppError::new(ErrorCode::ProcessSupervisor))
    }
}

/// The Claude driver (ADR 0038), shared by every reply, so that each session keeps its Claude
/// Code between turns.
pub struct Claude(pub Arc<ClaudeDriver>);

impl Claude {
    /// The driver that starts the person's own `claude` under the supervisor, or one that says why
    /// it cannot, when Windows did not let the supervisor be made.
    pub fn with(supervisor: Option<&Arc<Supervisor>>) -> Self {
        let launcher: Arc<dyn Launcher> = match supervisor {
            Some(supervisor) => Arc::new(ProgramLauncher::new(Arc::clone(supervisor))),
            None => Arc::new(Unsupervised),
        };
        Self(Arc::new(ClaudeDriver::new(launcher)))
    }
}

/// Starts nothing: programs cannot be supervised on this computer (`ARD-PROC-001`).
struct Unsupervised;

impl Launcher for Unsupervised {
    fn launch(&self, _start: &Start) -> Result<Connection, LaunchError> {
        Err(LaunchError::Failed(
            "Arden Code cannot start programs on this computer (ARD-PROC-001)".into(),
        ))
    }
}

/// What was found about the agent programs, once they were looked for: kept, so that Settings →
/// Agents and the agent of a new session need not look again (ADR 0039).
#[derive(Default)]
pub struct Detections(Mutex<Option<Vec<Detection>>>);

impl Detections {
    fn kept(&self) -> Option<Vec<Detection>> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn keep(&self, found: Vec<Detection>) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(found);
    }

    /// Whether Claude Code was found, the last time the agent programs were looked for.
    pub fn claude_installed(&self) -> bool {
        self.kept()
            .into_iter()
            .flatten()
            .any(|found| found.cli == AgentCli::Claude && found.installed)
    }
}

/// Tells the page what was found about the agent programs, when they were looked for on their own.
#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct AgentsDetected {
    pub detections: Vec<Detection>,
}

/// Looks for the agent programs. Asking each for its version can take a moment, so it runs off the
/// thread of the window.
async fn look(supervisor: Arc<Supervisor>) -> Result<Vec<Detection>, AppError> {
    tauri::async_runtime::spawn_blocking(move || detect::detect_all(&supervisor))
        .await
        .map_err(|error| AppError::new(ErrorCode::Unexpected).with_details(error.to_string()))
}

/// Looks for the agent programs once, in the background after start, keeps what was found, and
/// tells the page (ADR 0039).
pub fn detect_after_start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(supervisor) = app.state::<Programs>().0.clone() else {
            return;
        };
        match look(supervisor).await {
            Ok(found) => {
                app.state::<Detections>().keep(found.clone());
                let _ = AgentsDetected { detections: found }.emit(&app);
            }
            Err(error) => tracing::warn!(
                code = error.code.as_str(),
                details = error.details.as_deref().unwrap_or_default(),
                "the agent programs could not be looked for"
            ),
        }
    });
}

/// What was found about the Claude Code and Codex programs: where they are, which version, and
/// whether Claude Code is signed in. It changes nothing. What was found is kept; `fresh` looks
/// again, as Look again does.
///
/// # Errors
///
/// Returns `ARD-PROC-001` when programs cannot be supervised on this computer, and an unexpected
/// error when the search itself could not run.
#[tauri::command]
#[specta::specta]
pub async fn detect_agents(
    fresh: bool,
    programs: State<'_, Programs>,
    detections: State<'_, Detections>,
) -> Result<Vec<Detection>, AppError> {
    if !fresh && let Some(kept) = detections.kept() {
        return Ok(kept);
    }
    let found = look(programs.supervisor()?).await?;
    detections.keep(found.clone());
    Ok(found)
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
