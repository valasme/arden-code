//! Starting a Claude Code for a session (ADR 0038). The app starts the person's own `claude`; tests
//! start one that plays a script.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, SystemTime};

use arden_process::command::Arg;
use arden_process::resolve::Resolved;
use arden_process::supervisor::Supervisor;

use super::locate::{self, Missing};
use crate::detect::parse_version;
use crate::model::{Effort, Model, PermissionMode};

/// How long Claude Code gets to say its version.
const VERSION_PATIENCE: Duration = Duration::from_secs(10);

/// The variables that tie a process to a Claude Code session above it, such as a terminal inside
/// Claude Code that Arden Code was started from. A session of Arden Code's is its own, so they are
/// left out. Variables a person sets for Claude Code themselves are kept.
pub const HOST_VARIABLES: &[&str] = &[
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_HOST_SESSION_ID",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_OAUTH_SCOPES",
    "CLAUDE_CODE_ACCOUNT_UUID",
    "CLAUDE_CODE_ORGANIZATION_UUID",
    "CLAUDE_CODE_USER_EMAIL",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_AGENT_SDK_VERSION",
    "CLAUDE_PID",
];

/// Which conversation a new `claude` holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Conversation {
    /// A new conversation, under this id.
    New(String),
    /// The conversation with this id, carried on.
    Resume(String),
    /// None: a Claude Code started only to hear what it can do, which keeps nothing (ADR 0042).
    Listing,
}

/// What a new `claude` is started with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Start {
    /// The project's folder, where Claude works.
    pub folder: PathBuf,
    pub conversation: Conversation,
    /// The model to work with, or none for Claude Code's own setting (ADR 0041).
    pub model: Option<Model>,
    /// How much to think, or none for Claude Code's own setting (ADR 0041).
    pub effort: Option<Effort>,
    /// How far Claude may go without asking (ADR 0044).
    pub permission_mode: PermissionMode,
    /// Whether Bypass permissions may be chosen in it, as Settings allows (ADR 0044).
    pub allow_bypass: bool,
}

/// A running Claude Code: what Arden Code writes to it, what it writes back, and its process, when
/// it is a real one.
pub struct Connection {
    pub input: Box<dyn Write + Send>,
    pub output: Box<dyn Read + Send>,
    pub process: Option<Child>,
}

/// Why no Claude Code could be started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    NotInstalled,
    /// The installed Claude Code is older than the minimum: this version.
    TooOld(String),
    /// Only npm's `claude.cmd` is there, with no program behind it.
    NpmWrapperOnly,
    /// It could not be started: why, for the logs.
    Failed(String),
}

/// How the driver gets a running Claude Code.
pub trait Launcher: Send + Sync {
    /// Starts one.
    ///
    /// # Errors
    ///
    /// Says why none could be started.
    fn launch(&self, start: &Start) -> Result<Connection, LaunchError>;
}

/// The version Claude Code gave, for the program file as it was when it was asked.
struct Checked {
    path: PathBuf,
    modified: Option<SystemTime>,
    version: String,
}

/// Starts the person's own `claude`, found on `PATH` (ADR 0038).
pub struct ProgramLauncher {
    supervisor: Arc<Supervisor>,
    /// Where to look: this process's `PATH`, unless a test gives another.
    search_path: Option<OsString>,
    checked: Mutex<Option<Checked>>,
}

impl ProgramLauncher {
    /// Looks for `claude` on this process's `PATH`.
    #[must_use]
    pub fn new(supervisor: Arc<Supervisor>) -> Self {
        Self {
            supervisor,
            search_path: None,
            checked: Mutex::new(None),
        }
    }

    /// Looks for `claude` in the folders of `search_path` instead.
    #[must_use]
    pub fn with_search_path(supervisor: Arc<Supervisor>, search_path: OsString) -> Self {
        Self {
            supervisor,
            search_path: Some(search_path),
            checked: Mutex::new(None),
        }
    }

    fn find(&self) -> Result<Resolved, Missing> {
        match &self.search_path {
            Some(search_path) => locate::find(search_path, ".COM;.EXE;.BAT;.CMD".as_ref()),
            None => locate::find_from_environment(),
        }
    }

    /// Claude Code's version, asked once for each program file.
    fn version_of(&self, program: &Resolved) -> Result<String, LaunchError> {
        let modified = std::fs::metadata(&program.path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let mut checked = self.checked.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(known) = checked.as_ref()
            && known.path == program.path
            && known.modified == modified
        {
            return Ok(known.version.clone());
        }
        let done = self
            .supervisor
            .run(
                "claude-version",
                program,
                &[Arg::Literal("--version")],
                VERSION_PATIENCE,
            )
            .map_err(|error| LaunchError::Failed(error.to_string()))?;
        let version = parse_version(&done.output)
            .filter(|_| !done.timed_out && done.exit_code == Some(0))
            .ok_or_else(|| LaunchError::Failed("Claude Code's version could not be read".into()))?;
        *checked = Some(Checked {
            path: program.path.clone(),
            modified,
            version: version.clone(),
        });
        Ok(version)
    }
}

/// The arguments that start a conversation in `claude`'s headless streaming mode (ADR 0038).
fn arguments(start: &Start) -> Vec<Arg> {
    let mut arguments = vec![
        Arg::Literal("-p"),
        Arg::Literal("--input-format"),
        Arg::Literal("stream-json"),
        Arg::Literal("--output-format"),
        Arg::Literal("stream-json"),
        Arg::Literal("--verbose"),
        Arg::Literal("--include-partial-messages"),
        Arg::Literal("--permission-prompt-tool"),
        Arg::Literal("stdio"),
        Arg::Literal("--permission-mode"),
        Arg::Literal(start.permission_mode.claude_name()),
    ];
    // Claude Code switches to Bypass permissions only when it was started so that it can.
    if start.allow_bypass {
        arguments.push(Arg::Literal("--allow-dangerously-skip-permissions"));
    }
    // The value comes from Claude Code's own list of models, but it was kept in a file and
    // handed over by the page, so it is checked again before it is passed (ADR 0042).
    if let Some(model) = &start.model {
        if model.is_safe() {
            arguments.push(Arg::Literal("--model"));
            arguments.push(Arg::Untrusted(model.as_str().to_owned()));
        } else {
            tracing::warn!("a model that is not a model name was not passed to Claude Code");
        }
    }
    if let Some(effort) = start.effort {
        arguments.push(Arg::Literal("--effort"));
        arguments.push(Arg::Literal(effort.word()));
    }
    match &start.conversation {
        Conversation::New(id) => {
            arguments.push(Arg::Literal("--session-id"));
            arguments.push(Arg::Untrusted(id.clone()));
        }
        Conversation::Resume(id) => {
            arguments.push(Arg::Literal("--resume"));
            arguments.push(Arg::Untrusted(id.clone()));
        }
        Conversation::Listing => arguments.push(Arg::Literal("--no-session-persistence")),
    }
    arguments
}

impl Launcher for ProgramLauncher {
    fn launch(&self, start: &Start) -> Result<Connection, LaunchError> {
        let program = self.find().map_err(|missing| match missing {
            Missing::NotInstalled => LaunchError::NotInstalled,
            Missing::NpmWrapperOnly => LaunchError::NpmWrapperOnly,
        })?;
        let version = self.version_of(&program)?;
        if !locate::recent_enough(&version) {
            return Err(LaunchError::TooOld(version));
        }
        let piped = self
            .supervisor
            .spawn_piped(
                "claude",
                &program,
                &arguments(start),
                &start.folder,
                HOST_VARIABLES,
            )
            .map_err(|error| LaunchError::Failed(error.to_string()))?;
        Ok(Connection {
            input: Box::new(piped.input),
            output: Box::new(piped.output),
            process: Some(piped.child),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(start: &Start) -> Vec<String> {
        arguments(start)
            .iter()
            .map(|argument| match argument {
                Arg::Literal(text) => (*text).to_owned(),
                Arg::Untrusted(text) => text.clone(),
            })
            .collect()
    }

    fn start(model: Option<Model>) -> Start {
        Start {
            folder: PathBuf::from(r"C:\Work"),
            conversation: Conversation::New("c1".into()),
            model,
            effort: None,
            permission_mode: PermissionMode::Manual,
            allow_bypass: false,
        }
    }

    #[test]
    fn a_chosen_effort_is_passed_by_claude_code_s_word_and_default_passes_none() {
        let with = |effort| {
            texts(&Start {
                effort,
                ..start(None)
            })
        };
        for (effort, word) in [
            (Effort::Low, "low"),
            (Effort::Medium, "medium"),
            (Effort::High, "high"),
            (Effort::ExtraHigh, "xhigh"),
            (Effort::Max, "max"),
        ] {
            let chosen = with(Some(effort));
            let at = chosen
                .iter()
                .position(|text| text == "--effort")
                .expect("--effort");
            assert_eq!(chosen[at + 1], word);
        }
        assert!(!with(None).contains(&"--effort".to_owned()));
    }

    #[test]
    fn claude_code_starts_in_the_session_s_permission_mode_by_its_own_name() {
        for (mode, name) in [
            (PermissionMode::Manual, "default"),
            (PermissionMode::AcceptEdits, "acceptEdits"),
            (PermissionMode::Plan, "plan"),
            (PermissionMode::Auto, "auto"),
        ] {
            let arguments = texts(&Start {
                permission_mode: mode,
                ..start(None)
            });
            let at = arguments
                .iter()
                .position(|text| text == "--permission-mode")
                .expect("--permission-mode");
            assert_eq!(arguments[at + 1], name);
        }
    }

    #[test]
    fn the_flag_that_lets_bypass_permissions_be_chosen_is_passed_only_while_it_is_allowed() {
        let flag = "--allow-dangerously-skip-permissions".to_owned();
        assert!(!texts(&start(None)).contains(&flag));
        let allowed = texts(&Start {
            allow_bypass: true,
            permission_mode: PermissionMode::BypassPermissions,
            ..start(None)
        });
        assert!(allowed.contains(&flag));
        let at = allowed
            .iter()
            .position(|text| text == "--permission-mode")
            .expect("--permission-mode");
        assert_eq!(allowed[at + 1], "bypassPermissions");
    }

    #[test]
    fn a_claude_code_started_only_to_list_keeps_no_conversation() {
        let arguments = texts(&Start {
            conversation: Conversation::Listing,
            ..start(None)
        });

        assert!(arguments.contains(&"--no-session-persistence".to_owned()));
        assert!(!arguments.contains(&"--session-id".to_owned()));
        assert!(!arguments.contains(&"--resume".to_owned()));
    }

    #[test]
    fn a_full_model_id_from_claude_codes_list_is_passed_as_it_is() {
        for id in [
            "claude-opus-4-8",
            "claude-fable-5-1[1m]",
            "claude-haiku-4-5-20251001",
        ] {
            let arguments = texts(&start(Some(Model::new(id))));
            let at = arguments
                .iter()
                .position(|text| text == "--model")
                .expect("--model");
            assert_eq!(arguments[at + 1], id);
        }
    }

    #[test]
    fn a_value_that_is_not_a_model_name_is_never_passed() {
        for text in [
            "",
            "opus --dangerously-skip-permissions",
            "a&b",
            "x\"y",
            "opus
max",
            &"m".repeat(65),
        ] {
            let arguments = texts(&start(Some(Model::new(text))));
            assert!(
                !arguments.contains(&"--model".to_owned()),
                "{text:?} was passed"
            );
        }
    }

    #[test]
    fn a_chosen_model_is_passed_by_its_alias_and_default_passes_none() {
        let chosen = texts(&start(Some(Model::new("opus"))));
        let at = chosen
            .iter()
            .position(|text| text == "--model")
            .expect("--model");
        assert_eq!(chosen[at + 1], "opus");

        assert!(!texts(&start(None)).contains(&"--model".to_owned()));
        for (model, alias) in [
            (Model::new("fable"), "fable"),
            (Model::new("sonnet"), "sonnet"),
            (Model::new("haiku"), "haiku"),
        ] {
            assert!(texts(&start(Some(model))).contains(&alias.to_owned()));
        }
    }
}
