//! The commands for the agent programs: finding out which are installed.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use arden_agents::claude::driver::ClaudeDriver;
use arden_agents::claude::launch::{Connection, LaunchError, Launcher, ProgramLauncher, Start};
use arden_agents::detect::{self, AgentCli, Detection};
use arden_agents::driver::SessionChange;
use arden_agents::model::PermissionMode;
use arden_agents::store::SessionStore;
use arden_agents::usage::UsageLimits;
use arden_core::error::{AppError, ErrorCode};
use arden_process::supervisor::Supervisor;
use arden_settings::service::SettingsService;
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

    /// Tells the page each time the person's usage limits change, and asks for them while Show
    /// usage limits is on, asking again at once when it is turned back on (ADR 0043).
    pub fn report_usage_to(&self, app: &AppHandle, settings: &SettingsService) {
        let page = app.clone();
        self.0
            .on_usage_limits(Arc::new(move |limits: &UsageLimits| {
                let _ = UsageLimitsChanged {
                    limits: limits.clone(),
                }
                .emit(&page);
            }));
        let shown = settings.get().agents.show_usage_limits;
        self.0.ask_for_usage(shown);
        let driver = Arc::clone(&self.0);
        let app = app.clone();
        let was_shown = AtomicBool::new(shown);
        settings.subscribe(move |settings, _| {
            let shown = settings.agents.show_usage_limits;
            driver.ask_for_usage(shown);
            if shown && !was_shown.swap(shown, Ordering::AcqRel) {
                refresh_usage(&app, Duration::ZERO);
            } else {
                was_shown.store(shown, Ordering::Release);
            }
        });
    }
}

impl Claude {
    /// Keeps the permission mode each session's Claude Code says it applies, and tells the page
    /// when it changed, or when Claude Code refused the one chosen (ADR 0044).
    pub fn report_session_changes_to(&self, app: &AppHandle, sessions: &Arc<SessionStore>) {
        let page = app.clone();
        let sessions = Arc::clone(sessions);
        self.0
            .on_session_changes(Arc::new(move |session: &str, change: SessionChange| {
                let (mode, notice) = match change {
                    SessionChange::PermissionMode(mode) => (mode, None),
                    SessionChange::PermissionModeRefused { kept, reason } => {
                        tracing::warn!(session = %session, %reason, "Claude Code refused the permission mode");
                        (
                            kept,
                            Some(AppError::new(ErrorCode::PermissionModeRefused).with_details(reason)),
                        )
                    }
                };
                match sessions.follow_permission_mode(session, mode) {
                    Ok(changed) if changed || notice.is_some() => {
                        let _ = crate::sessions::SessionChanged {
                            session_id: session.to_owned(),
                            permission_mode: mode,
                            notice,
                        }
                        .emit(&page);
                    }
                    Ok(_) => {}
                    Err(error) => {
                        tracing::warn!(session = %session, ?error, "the permission mode Claude Code reported was not kept");
                    }
                }
            }));
    }
}

impl Claude {
    /// Lets Bypass permissions be chosen while Settings → Agents allows it (ADR 0044). Turned off,
    /// every session in it goes to Manual at once, its running Claude Code included, and the page
    /// is told.
    pub fn follow_bypass_setting(
        &self,
        app: &AppHandle,
        settings: &SettingsService,
        sessions: &Arc<SessionStore>,
    ) {
        let allowed = settings.get().agents.allow_bypass_permissions;
        sessions.allow_bypass_permissions(allowed);
        self.0.allow_bypass_permissions(allowed);
        let driver = Arc::clone(&self.0);
        let sessions = Arc::clone(sessions);
        let page = app.clone();
        settings.subscribe(move |settings, _| {
            let allowed = settings.agents.allow_bypass_permissions;
            driver.allow_bypass_permissions(allowed);
            for session in sessions.allow_bypass_permissions(allowed) {
                driver.set_permission_mode(&session, PermissionMode::Manual);
                tracing::info!(%session, "Bypass permissions was turned off, so the session is in Manual");
                let _ = crate::sessions::SessionChanged {
                    session_id: session,
                    permission_mode: PermissionMode::Manual,
                    notice: None,
                }
                .emit(&page);
            }
        });
    }
}

/// Tells the page that Claude Code reported new usage limits (ADR 0043).
#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimitsChanged {
    pub limits: UsageLimits,
}

/// How old the usage limits may be when the window comes back into focus before Claude Code is
/// asked again (ADR 0043).
const FOCUS_REFRESH: Duration = Duration::from_mins(5);

/// Asks Claude Code for the person's usage limits on a thread of its own, from the Playground,
/// unless it was asked within the last minute or answered within `older_than`. The page hears the
/// answer through [`UsageLimitsChanged`].
fn refresh_usage(app: &AppHandle, older_than: Duration) {
    let driver = Arc::clone(&app.state::<Claude>().0);
    let Some(folder) =
        crate::sessions::playground_folder(&app.state::<crate::sessions::Sessions>())
    else {
        return;
    };
    std::thread::spawn(move || {
        driver.refresh_usage(&folder, older_than);
    });
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
                let claude_installed = app.state::<Detections>().claude_installed();
                let _ = AgentsDetected { detections: found }.emit(&app);
                if claude_installed {
                    refresh_usage(&app, Duration::ZERO);
                }
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

/// The person's usage limits, as Claude Code last reported them (ADR 0043): unknown until it has
/// been asked.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps, clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn usage_limits(claude: State<'_, Claude>) -> Result<UsageLimits, AppError> {
    Ok(claude.0.usage_limits())
}

/// Asks Claude Code for the person's usage limits again (ADR 0043): on Look again, or, with
/// `on_focus`, when the window comes back into focus and they are more than 5 minutes old. Never
/// more than once a minute. The answer comes as [`UsageLimitsChanged`].
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps, clippy::needless_pass_by_value)]
#[tauri::command]
#[specta::specta]
pub fn refresh_usage_limits(on_focus: bool, app: AppHandle) -> Result<(), AppError> {
    refresh_usage(
        &app,
        if on_focus {
            FOCUS_REFRESH
        } else {
            Duration::ZERO
        },
    );
    Ok(())
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
