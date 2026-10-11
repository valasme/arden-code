//! The commands for the Plugins page (ADR 0053): the agents' plugins, through their own commands.

use std::sync::Arc;

use arden_agents::claude::plugins::{ClaudePlugins, InstalledPlugin, PluginError};
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
