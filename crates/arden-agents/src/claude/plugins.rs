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
use arden_process::supervisor::{Separated, Supervisor};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::launch::HOST_VARIABLES;
use super::locate::{self, Missing, PLUGINS_MINIMUM_VERSION, VersionCache};
use crate::model::AgentKind;

/// How long a plugin command may take before it is ended.
pub const PATIENCE: Duration = Duration::from_mins(5);

/// Where a plugin is installed, as Claude Code says it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
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

/// A plugin a marketplace offers, with only what the page shows (ADR 0053).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AvailablePlugin {
    /// The agent the plugin is for.
    pub agent: AgentKind,
    /// The agent's own id for it: `name@marketplace`.
    pub id: String,
    pub name: String,
    pub marketplace: String,
    pub description: Option<String>,
    pub version: Option<String>,
    /// How many times it was installed, when the marketplace counts it.
    #[specta(type = Option<f64>)]
    pub installs: Option<u64>,
    /// Where it comes from, as text: the repository or the path.
    pub source: String,
}

/// What a change to a plugin did, as Claude Code said it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginChange {
    /// Claude Code's own message.
    pub message: String,
    /// Whether a session gets the change only when its Claude Code next starts, because applying it
    /// now would cost its prompt cache (ADR 0053). The app says so once it has asked them.
    pub sessions_waiting: bool,
}

/// The result a change prints on its last line with `--json`, as far as Arden Code reads it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangeResult {
    outcome: String,
    #[serde(default)]
    message: String,
    failure_code: Option<String>,
}

/// The longest plugin id Arden Code passes on.
const ID_LIMIT: usize = 128;

/// Whether `id` is a plugin id Arden Code passes on (ADR 0053): `name@marketplace`, each side of
/// letters, digits, `.`, `_` and `-` and starting with a letter or digit, at most
/// [`ID_LIMIT`] characters. It comes from the catalog or the page, so it is checked before it
/// is passed.
fn is_plugin_id(id: &str) -> bool {
    let part = |text: &str| {
        text.chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphanumeric())
            && text
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
    };
    id.len() <= ID_LIMIT
        && id
            .split_once('@')
            .is_some_and(|(name, marketplace)| part(name) && part(marketplace))
}

/// A change to an installed plugin (ADR 0053).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PluginAction {
    Enable,
    Disable,
    Update,
    Uninstall,
}

impl PluginAction {
    const fn command(self) -> &'static str {
        match self {
            Self::Enable => "enable",
            Self::Disable => "disable",
            Self::Update => "update",
            Self::Uninstall => "uninstall",
        }
    }
}

/// Why a plugin command could not be run or did not succeed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginError {
    /// The plugin cannot be changed so: one from the person's organization, one synced from
    /// claude.ai that is to be removed, or one of a project whose folder is not given. Nothing ran.
    NotChangeable,
    /// The plugin id is not one Arden Code passes on, so nothing ran.
    InvalidId,
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

/// The catalog `claude plugin list --json --available` prints, as far as Arden Code reads it.
#[derive(Deserialize)]
struct ListedCatalog {
    available: Vec<ListedPlugin>,
}

/// One plugin of the catalog. Every other field is dropped while parsing.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListedPlugin {
    plugin_id: String,
    name: String,
    marketplace_name: String,
    description: Option<String>,
    version: Option<String>,
    install_count: Option<u64>,
    #[serde(default)]
    source: Value,
}

impl ListedPlugin {
    fn shown(self) -> AvailablePlugin {
        AvailablePlugin {
            agent: AgentKind::Claude,
            id: self.plugin_id,
            name: self.name,
            marketplace: self.marketplace_name,
            description: self.description.filter(|text| !text.trim().is_empty()),
            version: self.version,
            installs: self.install_count,
            source: source_text(&self.source),
        }
    }
}

/// Where a plugin comes from, as text: a path in its marketplace as it is, or the address, the
/// folder in it and the version, such as `https://github.com/adobe/skills.git · plugins/x · main`.
fn source_text(source: &Value) -> String {
    match source {
        Value::String(path) => path.clone(),
        Value::Object(fields) => ["url", "repo", "path", "ref"]
            .iter()
            .filter_map(|key| fields.get(*key).and_then(Value::as_str))
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
        _ => String::new(),
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
    /// The catalog, once it has been read in this run of Arden Code.
    catalog: Mutex<Option<Vec<AvailablePlugin>>>,
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
            catalog: Mutex::new(None),
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

    /// Every plugin the person's marketplaces offer: read from Claude Code the first time it is
    /// asked for in a run of Arden Code, and again when `fresh`; kept in memory between.
    ///
    /// # Errors
    ///
    /// Says why it could not be read.
    pub fn catalog(&self, fresh: bool) -> Result<Vec<AvailablePlugin>, PluginError> {
        if !fresh
            && let Some(kept) = self
                .catalog
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone()
        {
            return Ok(kept);
        }
        let output = self.run(
            &self.playground,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("list"),
                Arg::Literal("--json"),
                Arg::Literal("--available"),
            ],
        )?;
        let listed: ListedCatalog =
            serde_json::from_str(&output).map_err(|_| PluginError::NotUnderstood)?;
        let catalog: Vec<AvailablePlugin> = listed
            .available
            .into_iter()
            .map(ListedPlugin::shown)
            .collect();
        *self.catalog.lock().unwrap_or_else(PoisonError::into_inner) = Some(catalog.clone());
        Ok(catalog)
    }

    /// Installs a plugin: for the person in every project (`user`), in the Playground's folder,
    /// or for the person (`local`) or everyone (`project`) in one project, in that project's
    /// folder.
    ///
    /// # Errors
    ///
    /// Says why it was not installed; an id that is not a plugin id, another scope, or a project
    /// scope without the project's folder runs nothing.
    pub fn install(
        &self,
        id: &str,
        scope: PluginScope,
        project: Option<&Path>,
    ) -> Result<PluginChange, PluginError> {
        if !is_plugin_id(id) {
            return Err(PluginError::InvalidId);
        }
        let (scope_name, folder) = match (scope, project) {
            (PluginScope::User, _) => ("user", self.playground.as_path()),
            (PluginScope::Project, Some(project)) => ("project", project),
            (PluginScope::Local, Some(project)) => ("local", project),
            _ => return Err(PluginError::NotChangeable),
        };
        self.run_change(
            folder,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("install"),
                Arg::Untrusted(id.to_owned()),
                Arg::Literal("--scope"),
                Arg::Literal(scope_name),
                Arg::Literal("--json"),
            ],
        )
    }

    /// Turns an installed plugin on or off, updates it or uninstalls it, at the scope it is
    /// installed at: in the project's folder for a project's plugin, in the Playground's otherwise.
    /// A plugin synced from claude.ai can only be turned off and on; one from the person's
    /// organization cannot be changed.
    ///
    /// # Errors
    ///
    /// Says why it was not changed; nothing runs for an id that is not a plugin id or a change the
    /// plugin does not allow.
    pub fn change(
        &self,
        action: PluginAction,
        id: &str,
        scope: PluginScope,
        project: Option<&Path>,
    ) -> Result<PluginChange, PluginError> {
        if !is_plugin_id(id) {
            return Err(PluginError::InvalidId);
        }
        let (scope_name, folder) = match (scope, project) {
            (PluginScope::User, _) => (Some("user"), self.playground.as_path()),
            (PluginScope::Project, Some(project)) => (Some("project"), project),
            (PluginScope::Local, Some(project)) => (Some("local"), project),
            (PluginScope::Synced, _)
                if matches!(action, PluginAction::Enable | PluginAction::Disable) =>
            {
                (None, self.playground.as_path())
            }
            _ => return Err(PluginError::NotChangeable),
        };
        let mut args = vec![
            Arg::Literal("plugin"),
            Arg::Literal(action.command()),
            Arg::Untrusted(id.to_owned()),
        ];
        if let Some(scope_name) = scope_name {
            args.extend([Arg::Literal("--scope"), Arg::Literal(scope_name)]);
        }
        args.push(Arg::Literal("--json"));
        self.run_change(folder, &args)
    }

    /// Runs a command that changes plugins, and reads the result on the last line it printed. A
    /// change that was there already counts as done. The catalog is read again next time.
    fn run_change(&self, folder: &Path, args: &[Arg]) -> Result<PluginChange, PluginError> {
        let done = self.run_to_end(folder, args)?;
        *self.catalog.lock().unwrap_or_else(PoisonError::into_inner) = None;
        let result = done
            .output
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .and_then(|line| serde_json::from_str::<ChangeResult>(line).ok());
        let Some(result) = result else {
            return Err(if done.exit_code == Some(0) {
                PluginError::NotUnderstood
            } else {
                failure(&done.errors)
            });
        };
        let already = result.failure_code.as_deref() == Some("already_in_goal_state");
        if result.outcome == "ok" || already {
            return Ok(PluginChange {
                message: result.message,
                sessions_waiting: false,
            });
        }
        Err(PluginError::Failed {
            message: result.message,
            code: result.failure_code,
        })
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
    /// it wrote on its standard output, failing when it did.
    fn run(&self, folder: &Path, args: &[Arg]) -> Result<String, PluginError> {
        let done = self.run_to_end(folder, args)?;
        if done.exit_code != Some(0) {
            return Err(failure(&done.errors));
        }
        Ok(done.output)
    }

    /// Runs `claude` with `args` in `folder`, after any command still running, ending it after
    /// its patience.
    fn run_to_end(&self, folder: &Path, args: &[Arg]) -> Result<Separated, PluginError> {
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
        Ok(done)
    }
}

/// A command that failed with no result: the last thing it wrote as an error.
fn failure(errors: &str) -> PluginError {
    PluginError::Failed {
        message: errors
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Claude Code did not say why")
            .trim()
            .to_owned(),
        code: None,
    }
}
