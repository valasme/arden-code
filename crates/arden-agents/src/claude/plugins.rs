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
    /// A command the plugin's marketplace declares, which Claude Code showed instead of running:
    /// nothing was installed, and the person decides (ADR 0053).
    pub shown_command: Option<ShownCommand>,
}

/// A command a marketplace declares for a plugin, as Claude Code showed it, to be read in full
/// before it runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ShownCommand {
    /// The command as Claude Code displays it.
    pub command: String,
    /// The plugin it belongs to.
    pub plugin: String,
    /// Accepting passes this, and only this command runs.
    pub sha256: String,
    /// Whether it is not the command that was accepted, which changed since it was shown.
    pub changed: bool,
}

/// The result a change prints on its last line with `--json`, as far as Arden Code reads it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangeResult {
    outcome: String,
    #[serde(default)]
    message: String,
    failure_code: Option<String>,
    #[serde(default)]
    shown_command: Value,
}

/// The oldest Claude Code whose marketplace commands answer with `--json` (councils' Q32).
const MARKETPLACE_MINIMUM_VERSION: &str = "2.1.287";

/// The longest marketplace source Arden Code passes on.
const SOURCE_LIMIT: usize = 2048;

/// Whether `source` is a marketplace source Arden Code passes on (ADR 0053): some text that
/// cannot be read as a flag and holds no line break. Claude Code decides what it names.
fn is_marketplace_source(source: &str) -> bool {
    !source.trim().is_empty()
        && !source.starts_with('-')
        && !source.contains(['\n', '\r'])
        && source.len() <= SOURCE_LIMIT
}

/// Whether `name` is a plain name, as Claude Code gives plugins and marketplaces: letters, digits,
/// `.`, `_` and `-`, starting with a letter or digit, so that it cannot be read as a flag.
fn is_plain_name(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
}

/// Whether `name` is a marketplace's name Arden Code passes on.
fn is_marketplace_name(name: &str) -> bool {
    name.len() <= ID_LIMIT && is_plain_name(name)
}

/// The oldest Claude Code that takes `--accept-command`.
const ACCEPT_MINIMUM_VERSION: &str = "2.1.271";

/// Whether `text` is a sha256 as Claude Code gives one: 64 hexadecimal digits. It comes from Claude
/// Code's answer by way of the page, so it is checked before it is passed back.
fn is_sha256(text: &str) -> bool {
    text.len() == 64 && text.chars().all(|character| character.is_ascii_hexdigit())
}

/// The longest plugin id Arden Code passes on.
const ID_LIMIT: usize = 128;

/// Whether `id` is a plugin id Arden Code passes on (ADR 0053): `name@marketplace`, each side of
/// letters, digits, `.`, `_` and `-` and starting with a letter or digit, at most
/// [`ID_LIMIT`] characters. It comes from the catalog or the page, so it is checked before it
/// is passed.
fn is_plugin_id(id: &str) -> bool {
    id.len() <= ID_LIMIT
        && id
            .split_once('@')
            .is_some_and(|(name, marketplace)| is_plain_name(name) && is_plain_name(marketplace))
}

/// A marketplace the person has added, with only what the page shows (ADR 0053).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Marketplace {
    /// The agent whose marketplace it is.
    pub agent: AgentKind,
    pub name: String,
    /// Where it comes from, as text: the repository, the address or the path, and its version.
    pub source: String,
}

/// One marketplace of `claude plugin marketplace list --json`, as far as Arden Code reads it.
#[derive(Deserialize)]
struct ListedMarketplace {
    name: String,
    #[serde(flatten)]
    fields: serde_json::Map<String, Value>,
}

/// A change to a marketplace (ADR 0053).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum MarketplaceAction {
    /// Reads its listing again from where it comes from.
    Update,
    /// Removes it, and with it every plugin installed from it.
    Remove,
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
    /// The marketplace's source or name is not one Arden Code passes on, so nothing ran.
    InvalidSource,
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
        Value::Object(fields) => where_from(fields),
        _ => String::new(),
    }
}

/// The address or repository, the path and the version of a source Claude Code describes, joined.
fn where_from(fields: &serde_json::Map<String, Value>) -> String {
    ["url", "repo", "path", "ref"]
        .iter()
        .filter_map(|key| fields.get(*key).and_then(Value::as_str))
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
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
        accept: Option<&str>,
    ) -> Result<PluginChange, PluginError> {
        if !is_plugin_id(id) || accept.is_some_and(|sha256| !is_sha256(sha256)) {
            return Err(PluginError::InvalidId);
        }
        let (scope_name, folder) = self
            .place(scope, project)
            .ok_or(PluginError::NotChangeable)?;
        self.run_accepting(
            folder,
            vec![
                Arg::Literal("plugin"),
                Arg::Literal("install"),
                Arg::Untrusted(id.to_owned()),
                Arg::Literal("--scope"),
                Arg::Literal(scope_name),
            ],
            accept,
        )
    }

    /// The `--scope` a plugin is installed at, and the folder its commands run in: the
    /// Playground's for the person's, the project's for a project's. Nothing for a scope Arden
    /// Code does not install at, or a project's without its folder.
    fn place<'a>(
        &'a self,
        scope: PluginScope,
        project: Option<&'a Path>,
    ) -> Option<(&'static str, &'a Path)> {
        match (scope, project) {
            (PluginScope::User, _) => Some(("user", self.playground.as_path())),
            (PluginScope::Project, Some(project)) => Some(("project", project)),
            (PluginScope::Local, Some(project)) => Some(("local", project)),
            _ => None,
        }
    }

    /// Runs a change that a marketplace may declare a command for, accepting only the command
    /// whose `sha256` the person accepted, if any. `--yes`, which accepts any, is never passed.
    fn run_accepting(
        &self,
        folder: &Path,
        mut args: Vec<Arg>,
        accept: Option<&str>,
    ) -> Result<PluginChange, PluginError> {
        if let Some(sha256) = accept {
            args.extend([
                Arg::Literal("--accept-command"),
                Arg::Untrusted(sha256.to_owned()),
            ]);
        }
        args.push(Arg::Literal("--json"));
        let minimum = if accept.is_some() {
            ACCEPT_MINIMUM_VERSION
        } else {
            PLUGINS_MINIMUM_VERSION
        };
        self.run_change_at(folder, &args, minimum)
    }

    /// The marketplaces the person has added, from `claude plugin marketplace list --json`.
    ///
    /// # Errors
    ///
    /// Says why they could not be read.
    pub fn marketplaces(&self) -> Result<Vec<Marketplace>, PluginError> {
        let output = self.run(
            &self.playground,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("marketplace"),
                Arg::Literal("list"),
                Arg::Literal("--json"),
            ],
        )?;
        let listed: Vec<ListedMarketplace> =
            serde_json::from_str(&output).map_err(|_| PluginError::NotUnderstood)?;
        Ok(listed
            .into_iter()
            .map(|listed| Marketplace {
                agent: AgentKind::Claude,
                source: where_from(&listed.fields),
                name: listed.name,
            })
            .collect())
    }

    /// Adds a marketplace for the person, from a GitHub `owner/repo`, a git address, a folder or
    /// a `marketplace.json` address, in the Playground's folder.
    ///
    /// # Errors
    ///
    /// Says why it was not added; a source that could be read as a flag or holds a line break runs
    /// nothing.
    pub fn add_marketplace(&self, source: &str) -> Result<PluginChange, PluginError> {
        if !is_marketplace_source(source) {
            return Err(PluginError::InvalidSource);
        }
        self.run_change_at(
            &self.playground,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("marketplace"),
                Arg::Literal("add"),
                Arg::Untrusted(source.trim().to_owned()),
                Arg::Literal("--json"),
            ],
            MARKETPLACE_MINIMUM_VERSION,
        )
    }

    /// Updates a marketplace's listing, or removes it with the plugins installed from it.
    ///
    /// # Errors
    ///
    /// Says why it was not changed; a name that is not a marketplace's runs nothing.
    pub fn change_marketplace(
        &self,
        action: MarketplaceAction,
        name: &str,
    ) -> Result<PluginChange, PluginError> {
        if !is_marketplace_name(name) {
            return Err(PluginError::InvalidSource);
        }
        let command = match action {
            MarketplaceAction::Update => "update",
            MarketplaceAction::Remove => "remove",
        };
        self.run_change_at(
            &self.playground,
            &[
                Arg::Literal("plugin"),
                Arg::Literal("marketplace"),
                Arg::Literal(command),
                Arg::Untrusted(name.to_owned()),
                Arg::Literal("--json"),
            ],
            MARKETPLACE_MINIMUM_VERSION,
        )
    }

    /// Turns an installed plugin on or off, updates it or uninstalls it, at the scope it is
    /// installed at: in the project's folder for a project's plugin, in the Playground's otherwise.
    /// A plugin synced from claude.ai can only be turned off and on; one from the person's
    /// organization cannot be changed.
    ///
    /// An update can answer with a command its marketplace declares, as an install can; `accept`
    /// is the `sha256` of the one the person accepted, and only an update takes it.
    ///
    /// # Errors
    ///
    /// Says why it was not changed; nothing runs for an id that is not a plugin id, a command
    /// accepted for anything but an update, or a change the plugin does not allow.
    pub fn change(
        &self,
        action: PluginAction,
        id: &str,
        scope: PluginScope,
        project: Option<&Path>,
        accept: Option<&str>,
    ) -> Result<PluginChange, PluginError> {
        let accepts = action == PluginAction::Update;
        if !is_plugin_id(id) || accept.is_some_and(|sha256| !accepts || !is_sha256(sha256)) {
            return Err(PluginError::InvalidId);
        }
        let mut args = vec![
            Arg::Literal("plugin"),
            Arg::Literal(action.command()),
            Arg::Untrusted(id.to_owned()),
        ];
        let folder = match self.place(scope, project) {
            Some((scope_name, folder)) => {
                args.extend([Arg::Literal("--scope"), Arg::Literal(scope_name)]);
                folder
            }
            // A plugin synced from claude.ai is turned off and on where Claude Code finds it.
            None if scope == PluginScope::Synced
                && matches!(action, PluginAction::Enable | PluginAction::Disable) =>
            {
                self.playground.as_path()
            }
            None => return Err(PluginError::NotChangeable),
        };
        self.run_accepting(folder, args, accept)
    }

    /// Runs a command that changes plugins, with a Claude Code of `minimum` or later, and reads the
    /// result on the last line it printed. A change that was there already counts as done, and a
    /// command a marketplace declares, shown instead of run, is answered as one to accept. The
    /// catalog is read again next time.
    fn run_change_at(
        &self,
        folder: &Path,
        args: &[Arg],
        minimum: &str,
    ) -> Result<PluginChange, PluginError> {
        let done = self.run_to_end(folder, args, minimum)?;
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
                shown_command: None,
            });
        }
        if let Some(shown) = shown_command(&result.shown_command, &done.output) {
            return Ok(PluginChange {
                message: result.message,
                sessions_waiting: false,
                shown_command: Some(shown),
            });
        }
        Err(PluginError::Failed {
            message: result.message,
            code: result.failure_code,
        })
    }

    /// The person's Claude Code, when it is there and `minimum` or later.
    fn program(&self, minimum: &str) -> Result<Resolved, PluginError> {
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
        if !locate::at_least(&version, minimum) {
            return Err(PluginError::TooOld(version));
        }
        Ok(program)
    }

    /// Runs `claude` with `args` in `folder`, after any command still running, and answers what
    /// it wrote on its standard output, failing when it did.
    fn run(&self, folder: &Path, args: &[Arg]) -> Result<String, PluginError> {
        let done = self.run_to_end(folder, args, PLUGINS_MINIMUM_VERSION)?;
        if done.exit_code != Some(0) {
            return Err(failure(&done.errors));
        }
        Ok(done.output)
    }

    /// Runs `claude` with `args` in `folder`, after any command still running, with a Claude Code
    /// of `minimum` or later, ending it after its patience.
    fn run_to_end(
        &self,
        folder: &Path,
        args: &[Arg],
        minimum: &str,
    ) -> Result<Separated, PluginError> {
        let _turn = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        let program = self.program(minimum)?;
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

/// The command a failed install showed instead of running, from its `shownCommand`: the command
/// itself, or the lines Claude Code printed before its result when the object does not hold it.
fn shown_command(shown: &Value, output: &str) -> Option<ShownCommand> {
    let sha256 = shown["sha256"]
        .as_str()
        .filter(|sha256| is_sha256(sha256))?;
    let printed = || {
        let lines: Vec<&str> = output
            .lines()
            .filter(|line| !line.trim().is_empty())
            .collect();
        lines[..lines.len().saturating_sub(1)].join("\n")
    };
    let command = shown["command"]
        .as_str()
        .map_or_else(printed, str::to_owned);
    if command.trim().is_empty() {
        return None;
    }
    Some(ShownCommand {
        command,
        plugin: shown["pluginId"]
            .as_str()
            .or_else(|| shown["plugin"].as_str())
            .unwrap_or_default()
            .to_owned(),
        sha256: sha256.to_owned(),
        changed: shown["acceptCommandMatched"] == false,
    })
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
