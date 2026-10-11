//! Claude's plugins, through the person's own Claude Code (ADR 0053).
//!
//! Arden Code never reads or writes Claude Code's files: it runs `claude plugin … --json`, found and
//! started as the driver starts Claude Code, through the supervisor, one command at a time, and
//! ended after [`PATIENCE`]. Of Claude Code's answers it keeps only the fields the page shows, and
//! its standard output is never logged: the installed list can hold a server's environment, tokens
//! included.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use arden_process::command::Arg;
use arden_process::resolve::Resolved;
use arden_process::supervisor::Supervisor;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::launch::HOST_VARIABLES;
use super::locate::{self, Missing, PLUGINS_MINIMUM_VERSION, VersionCache};
use crate::model::AgentKind;

/// How long a plugin command may take before it is ended.
pub const PATIENCE: Duration = Duration::from_mins(5);

/// Where a plugin is installed, as Claude Code says it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PluginScope {
    /// For the person, in every project.
    User,
    /// For everyone in a project, in its shared `.claude/settings.json`.
    Project,
    /// For the person, in one project.
    Local,
    /// By the person's organization: it cannot be changed here.
    Managed,
    /// From the person's claude.ai account: it is removed there.
    Synced,
    /// Loaded for one session only.
    Session,
    /// A scope this version of Arden Code does not know.
    Other,
}

impl PluginScope {
    /// The scope Claude Code names, or [`PluginScope::Other`] for one Arden Code does not know.
    fn named(name: &str) -> Self {
        match name {
            "user" => Self::User,
            "project" => Self::Project,
            "local" => Self::Local,
            "managed" => Self::Managed,
            "synced" => Self::Synced,
            "session" => Self::Session,
            _ => Self::Other,
        }
    }
}

/// An installed plugin, with only what the page shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    /// The agent the plugin belongs to.
    pub agent: AgentKind,
    /// The agent's own id for it: `name@marketplace`.
    pub id: String,
    pub name: String,
    pub marketplace: String,
    pub scope: PluginScope,
    /// The project's folder, for a plugin installed for a project.
    pub project_path: Option<String>,
    pub version: Option<String>,
    pub enabled: bool,
    /// What went wrong when it was loaded.
    pub errors: Vec<String>,
}

/// Why a plugin command could not be run or did not succeed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginError {
    /// No Claude Code was found.
    NotInstalled,
    /// Only npm's `claude.cmd` was found, with no program behind it.
    NpmWrapperOnly,
    /// Claude Code is older than [`PLUGINS_MINIMUM_VERSION`]: this version.
    TooOld(String),
    /// The command failed: Claude Code's message, and its code when it gave one.
    Failed {
        message: String,
        code: Option<String>,
    },
    /// Claude Code answered in a way Arden Code does not understand.
    NotUnderstood,
    /// The command took longer than its patience, and was ended.
    TooLong,
    /// The command could not be started: why, for the logs.
    CouldNotRun(String),
}

/// One entry of `claude plugin list --json`, as far as Arden Code reads it. Every other field,
/// such as `mcpServers`, is dropped while parsing.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListedInstall {
    id: String,
    version: Option<String>,
    scope: String,
    #[serde(default)]
    enabled: bool,
    project_path: Option<String>,
    #[serde(default)]
    errors: Vec<Value>,
}

impl ListedInstall {
    fn shown(self) -> InstalledPlugin {
        let (name, marketplace) = self
            .id
            .split_once('@')
            .map_or((self.id.as_str(), ""), |(name, marketplace)| {
                (name, marketplace)
            });
        InstalledPlugin {
            agent: AgentKind::Claude,
            name: name.to_owned(),
            marketplace: marketplace.to_owned(),
            scope: PluginScope::named(&self.scope),
            project_path: self.project_path,
            version: self.version,
            enabled: self.enabled,
            errors: self.errors.iter().map(error_text).collect(),
            id: self.id,
        }
    }
}

/// The words of a load error: the text itself, or its `message`.
fn error_text(error: &Value) -> String {
    match error {
        Value::String(text) => text.clone(),
        other => other["message"]
            .as_str()
            .unwrap_or("The plugin could not be loaded")
            .to_owned(),
    }
}

/// Claude's plugins, through `claude plugin … --json`.
pub struct ClaudePlugins {
    supervisor: Arc<Supervisor>,
    /// The Playground's folder, where commands that belong to no project run.
    playground: PathBuf,
    /// Where to look for `claude`: this process's `PATH`, unless a test gives another.
    search_path: Option<OsString>,
    patience: Duration,
    versions: VersionCache,
    /// Held while a command runs, so that two never change Claude Code's settings at once.
    running: Mutex<()>,
}

impl ClaudePlugins {
    /// Looks for `claude` on this process's `PATH`.
    #[must_use]
    pub fn new(supervisor: Arc<Supervisor>, playground: &Path) -> Self {
        Self {
            supervisor,
            playground: playground.to_path_buf(),
            search_path: None,
            patience: PATIENCE,
            versions: VersionCache::default(),
            running: Mutex::new(()),
        }
    }

    /// Looks for `claude` in the folders of `search_path` instead.
    #[must_use]
    pub fn with_search_path(
        supervisor: Arc<Supervisor>,
        playground: &Path,
        search_path: OsString,
    ) -> Self {
        Self {
            search_path: Some(search_path),
            ..Self::new(supervisor, playground)
        }
    }

    /// Ends a command after `patience` instead of [`PATIENCE`].
    #[must_use]
    pub fn with_patience(self, patience: Duration) -> Self {
        Self { patience, ..self }
    }

    /// The plugins Claude Code has installed, in every scope, from its terminal too.
    ///
    /// # Errors
    ///
    /// Says why they could not be read.
    pub fn installed(&self) -> Result<Vec<InstalledPlugin>, PluginError> {
        let output = self.run(
            &self.playground,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("list"),
                Arg::Literal("--json"),
            ],
        )?;
        let listed: Vec<ListedInstall> =
            serde_json::from_str(&output).map_err(|_| PluginError::NotUnderstood)?;
        Ok(listed.into_iter().map(ListedInstall::shown).collect())
    }

    /// The person's Claude Code, when it is there and recent enough for plugin commands.
    fn program(&self) -> Result<Resolved, PluginError> {
        let found = match &self.search_path {
            Some(search_path) => locate::find(search_path, ".COM;.EXE;.BAT;.CMD".as_ref()),
            None => locate::find_from_environment(),
        };
        let program = found.map_err(|missing| match missing {
            Missing::NotInstalled => PluginError::NotInstalled,
            Missing::NpmWrapperOnly => PluginError::NpmWrapperOnly,
        })?;
        let version = self
            .versions
            .version_of(&self.supervisor, &program)
            .map_err(PluginError::CouldNotRun)?;
        if !locate::at_least(&version, PLUGINS_MINIMUM_VERSION) {
            return Err(PluginError::TooOld(version));
        }
        Ok(program)
    }

    /// Runs `claude` with `args` in `folder`, after any command still running, and answers what
    /// it wrote on its standard output.
    fn run(&self, folder: &Path, args: &[Arg]) -> Result<String, PluginError> {
        let _turn = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        let program = self.program()?;
        let done = self
            .supervisor
            .run_in(
                "claude-plugin",
                &program,
                args,
                folder,
                HOST_VARIABLES,
                self.patience,
            )
            .map_err(|error| PluginError::CouldNotRun(error.to_string()))?;
        if done.timed_out {
            return Err(PluginError::TooLong);
        }
        if done.exit_code != Some(0) {
            let message = done
                .errors
                .lines()
                .rev()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("Claude Code did not say why")
                .trim()
                .to_owned();
            return Err(PluginError::Failed {
                message,
                code: None,
            });
        }
        Ok(done.output)
    }
}
