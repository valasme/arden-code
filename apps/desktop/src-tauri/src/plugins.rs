//! The commands for the Plugins page (ADR 0053): the agents' plugins, through their own commands.

use std::sync::Arc;

use std::path::PathBuf;

use arden_agents::claude::plugins::{
    AvailablePlugin, ClaudePlugins, InstalledPlugin, Marketplace, MarketplaceAction, PluginAction,
    PluginChange, PluginError, PluginScope,
};
use arden_agents::model::ProjectKind;
use arden_core::error::{AppError, ErrorCode};
use tauri::State;

/// Claude's plugins, when programs can be supervised on this computer.
pub struct Plugins(pub Option<Arc<ClaudePlugins>>);

impl Plugins {
    fn claude(&self) -> Result<Arc<ClaudePlugins>, AppError> {
        self.0
            .clone()
            .ok_or_else(|| AppError::new(ErrorCode::ProcessSupervisor))
    }
}

/// What the person is told when a plugin command could not be run or did not succeed. Claude
/// Code's own message goes to the page, never to the log: it can name a plugin's settings.
fn plugin_error(error: PluginError) -> AppError {
    let shown = match error {
        PluginError::InvalidId => AppError::new(ErrorCode::PluginCommandFailed)
            .with_details("This is not the id of a plugin, so nothing was run."),
        PluginError::InvalidSource => AppError::new(ErrorCode::PluginCommandFailed)
            .with_details("This is not a marketplace source, so nothing was run."),
        PluginError::NotChangeable => AppError::new(ErrorCode::PluginCommandFailed)
            .with_details("This plugin cannot be changed that way here."),
        PluginError::NotInstalled => AppError::new(ErrorCode::ClaudeNotInstalled),
        PluginError::NpmWrapperOnly => AppError::new(ErrorCode::ClaudeNpmWrapper),
        PluginError::TooOld(version) => {
            AppError::new(ErrorCode::PluginsNeedNewerClaude).with_details(version)
        }
        PluginError::Failed { message, .. } => {
            AppError::new(ErrorCode::PluginCommandFailed).with_details(message)
        }
        PluginError::NotUnderstood => AppError::new(ErrorCode::PluginAnswerNotUnderstood),
        PluginError::TooLong => AppError::new(ErrorCode::PluginCommandTooLong),
        PluginError::CouldNotRun(why) => {
            tracing::warn!(%why, "a plugin command could not be started");
            AppError::new(ErrorCode::PluginCommandFailed)
        }
    };
    tracing::warn!(
        code = shown.code.as_str(),
        "a plugin command did not succeed"
    );
    shown
}

/// Runs a change to plugins off the window's thread, then gives it to the running Claude Codes
/// (ADR 0053): each reloads its plugins unless that would cost its prompt cache, and the answer
/// says whether a session waits for its next start. With none running, the slash commands are
/// heard again in the Playground.
async fn change_off_the_window(
    claude: &crate::agents::Claude,
    sessions: &crate::sessions::Sessions,
    work: impl FnOnce() -> Result<PluginChange, PluginError> + Send + 'static,
) -> Result<PluginChange, AppError> {
    let driver = Arc::clone(&claude.0);
    let playground = crate::sessions::playground_folder(sessions);
    off_the_window(move || {
        let mut change = work()?;
        // A command shown instead of run changed nothing yet.
        if let (Some(playground), None) = (playground, &change.shown_command) {
            change.sessions_waiting = driver.reload_plugins(&playground).waiting;
        }
        Ok(change)
    })
    .await
}

/// Runs a plugin command off the window's thread: it can take a while.
async fn off_the_window<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, PluginError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| AppError::new(ErrorCode::Unexpected).with_details(error.to_string()))?
        .map_err(plugin_error)
}

/// The plugins the agents have installed, in every scope, from their terminals too: for now
/// Claude's, from `claude plugin list --json`.
///
/// # Errors
///
/// Returns why they could not be read: no Claude Code, one older than 2.1.268, or a command that
/// failed, took too long or answered in a way Arden Code does not understand.
#[tauri::command]
#[specta::specta]
pub async fn installed_plugins(
    plugins: State<'_, Plugins>,
) -> Result<Vec<InstalledPlugin>, AppError> {
    let claude = plugins.claude()?;
    off_the_window(move || claude.installed()).await
}

/// Every plugin the person's marketplaces offer (ADR 0053): read from the agent the first time the
/// page asks in a run of Arden Code, and again when `fresh`, as on Refresh.
///
/// # Errors
///
/// Returns why it could not be read, as [`installed_plugins`] does.
#[tauri::command]
#[specta::specta]
pub async fn plugin_catalog(
    fresh: bool,
    plugins: State<'_, Plugins>,
) -> Result<Vec<AvailablePlugin>, AppError> {
    let claude = plugins.claude()?;
    off_the_window(move || claude.catalog(fresh)).await
}

/// Installs a plugin (ADR 0053), once its id is checked: for the person in every project, or for
/// the person or everyone in a project, which must be a trusted folder project. Answers the agent's
/// own message.
///
/// # Errors
///
/// Returns why it was not installed: an id that is not a plugin id, a project that is unknown or
/// not trusted, or a command that failed (with the agent's message and code), took too long, or
/// answered in a way Arden Code does not understand.
#[tauri::command]
#[specta::specta]
pub async fn install_plugin(
    id: String,
    scope: PluginScope,
    project_id: Option<String>,
    accept_command: Option<String>,
    plugins: State<'_, Plugins>,
    claude: State<'_, crate::agents::Claude>,
    sessions: State<'_, crate::sessions::Sessions>,
) -> Result<PluginChange, AppError> {
    let module = plugins.claude()?;
    let folder = match project_id {
        Some(project_id) => Some(trusted_folder(&sessions, &project_id)?),
        None => None,
    };
    change_off_the_window(&claude, &sessions, move || {
        module.install(&id, scope, folder.as_deref(), accept_command.as_deref())
    })
    .await
}

/// The folder of a project a plugin command may run in: a folder project the person trusts
/// (ADR 0039, ADR 0053). Claude Code reads a project's settings when it runs there.
fn trusted_folder(
    sessions: &crate::sessions::Sessions,
    project_id: &str,
) -> Result<PathBuf, AppError> {
    let project = sessions
        .list()
        .projects
        .into_iter()
        .map(|listing| listing.project)
        .find(|project| project.id == project_id && project.kind == ProjectKind::Folder)
        .ok_or_else(|| AppError::new(ErrorCode::SessionNotFound))?;
    if !project.trusted {
        return Err(AppError::new(ErrorCode::ProjectNotTrusted));
    }
    Ok(PathBuf::from(project.path))
}

/// Turns an installed plugin on or off, updates it or uninstalls it, at the scope it is installed
/// at (ADR 0053). A project's plugin is changed in that project's folder, which must be a trusted
/// folder project. Answers the agent's own message.
///
/// # Errors
///
/// Returns why it was not changed: a project that is unknown or not trusted, a change the plugin
/// does not allow, or a command that failed (with the agent's message), took too long or answered
/// in a way Arden Code does not understand.
#[tauri::command]
#[specta::specta]
pub async fn change_plugin(
    action: PluginAction,
    id: String,
    scope: PluginScope,
    project_id: Option<String>,
    plugins: State<'_, Plugins>,
    claude: State<'_, crate::agents::Claude>,
    sessions: State<'_, crate::sessions::Sessions>,
) -> Result<PluginChange, AppError> {
    let module = plugins.claude()?;
    let folder = match project_id {
        Some(project_id) => Some(trusted_folder(&sessions, &project_id)?),
        None => None,
    };
    change_off_the_window(&claude, &sessions, move || {
        module.change(action, &id, scope, folder.as_deref())
    })
    .await
}

/// The marketplaces the person has added (ADR 0053): for now Claude's, from
/// `claude plugin marketplace list --json`.
///
/// # Errors
///
/// Returns why they could not be read, as [`installed_plugins`] does.
#[tauri::command]
#[specta::specta]
pub async fn marketplaces(plugins: State<'_, Plugins>) -> Result<Vec<Marketplace>, AppError> {
    let claude = plugins.claude()?;
    off_the_window(move || claude.marketplaces()).await
}

/// Adds a marketplace from a source the person typed (ADR 0053), once it is checked, and answers
/// the agent's own message.
///
/// # Errors
///
/// Returns why it was not added: a source that could be read as a flag or holds a line break, a
/// Claude Code older than 2.1.287, or a command that failed (with the agent's message and code),
/// took too long or answered in a way Arden Code does not understand.
#[tauri::command]
#[specta::specta]
pub async fn add_marketplace(
    source: String,
    plugins: State<'_, Plugins>,
    claude: State<'_, crate::agents::Claude>,
    sessions: State<'_, crate::sessions::Sessions>,
) -> Result<PluginChange, AppError> {
    let module = plugins.claude()?;
    change_off_the_window(&claude, &sessions, move || module.add_marketplace(&source)).await
}

/// Updates a marketplace's listing, or removes it with the plugins installed from it (ADR 0053).
///
/// # Errors
///
/// Returns why it was not changed, as [`add_marketplace`] does.
#[tauri::command]
#[specta::specta]
pub async fn change_marketplace(
    action: MarketplaceAction,
    name: String,
    plugins: State<'_, Plugins>,
    claude: State<'_, crate::agents::Claude>,
    sessions: State<'_, crate::sessions::Sessions>,
) -> Result<PluginChange, AppError> {
    let module = plugins.claude()?;
    change_off_the_window(&claude, &sessions, move || {
        module.change_marketplace(action, &name)
    })
    .await
}
