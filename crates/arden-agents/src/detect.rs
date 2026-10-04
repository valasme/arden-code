//! Finding out which agent programs are installed, without changing anything (plan section 5.8).
//!
//! Detection only looks: it finds the program on `PATH`, asks it for its version, and reports.
//! Arden Code never installs, updates or signs in to an agent. The version is asked for with an
//! argument written in this source, so it is safe even for the `.cmd` wrapper that npm makes.

use std::ffi::OsStr;
use std::time::Duration;

use arden_process::command::Arg;
use arden_process::resolve::{self, Resolved};
use arden_process::supervisor::Supervisor;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::claude::locate::{MINIMUM_VERSION, recent_enough};

/// How long an agent gets to say its version. A program that is slow to start is not broken.
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);

/// The agent programs Arden Code will work with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AgentCli {
    /// The Claude Code program from Anthropic, `claude`.
    Claude,
    /// The Codex program, `codex`.
    Codex,
}

impl AgentCli {
    /// Every agent program, in the order they are shown.
    pub const ALL: [Self; 2] = [Self::Claude, Self::Codex];

    /// The name of the program on `PATH`.
    #[must_use]
    pub const fn program(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }

    /// Where a person installs it.
    #[must_use]
    pub const fn install_url(self) -> &'static str {
        match self {
            Self::Claude => "https://code.claude.com/docs/en/setup",
            Self::Codex => "https://github.com/openai/codex",
        }
    }
}

/// What was found about one agent program.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub cli: AgentCli,
    pub installed: bool,
    /// The file that would be started.
    pub path: Option<String>,
    /// Its version, when it could be read.
    pub version: Option<String>,
    /// The oldest version Arden Code works with, for the agents it works with already.
    pub minimum_version: Option<String>,
    /// Whether the version installed is older than the minimum.
    pub too_old: bool,
    /// Whether it is signed in, when it said so. Nothing else about the account is kept.
    pub signed_in: Option<bool>,
    /// Where to install it.
    pub install_url: String,
}

/// The version number in what a program printed for `--version`: the first thing in it that looks
/// like `1.2.3`, with or without a leading `v`. Programs word this differently (`2.1.5 (Claude
/// Code)`, `codex-cli 0.46.0`).
#[must_use]
pub fn parse_version(output: &str) -> Option<String> {
    output
        .lines()
        .flat_map(str::split_whitespace)
        .map(|word| {
            word.trim_matches(|c: char| {
                !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '+')
            })
        })
        .map(|word| word.strip_prefix('v').unwrap_or(word))
        .find(|word| looks_like_version(word))
        .map(str::to_owned)
}

fn looks_like_version(word: &str) -> bool {
    let number = word.split(['-', '+']).next().unwrap_or_default();
    let parts: Vec<&str> = number.split('.').collect();
    parts.len() >= 2
        && parts.len() <= 4
        && parts.iter().all(|part| {
            !part.is_empty() && part.len() <= 6 && part.chars().all(|c| c.is_ascii_digit())
        })
}

/// Whether Claude Code is signed in, from what `claude auth status --json` printed. Only that is
/// read: the rest, such as the account's email, is never kept.
#[must_use]
pub fn parse_signed_in(output: &str) -> Option<bool> {
    let signed_in = |text: &str| {
        serde_json::from_str::<serde_json::Value>(text.trim())
            .ok()?
            .get("loggedIn")?
            .as_bool()
    };
    signed_in(output).or_else(|| output.lines().find_map(signed_in))
}

/// Whether Claude Code is signed in. What it answers is kept out of the logs: it can hold the
/// account's email.
fn signed_in_of(supervisor: &Supervisor, program: &Resolved) -> Option<bool> {
    let done = supervisor
        .run_private(
            "claude-auth-status",
            program,
            &[
                Arg::Literal("auth"),
                Arg::Literal("status"),
                Arg::Literal("--json"),
            ],
            VERSION_TIMEOUT,
        )
        .ok()?;
    if done.timed_out {
        return None;
    }
    parse_signed_in(&done.output)
}

fn version_of(supervisor: &Supervisor, cli: AgentCli, program: &Resolved) -> Option<String> {
    let done = supervisor
        .run(
            &format!("{}-version", cli.program()),
            program,
            &[Arg::Literal("--version")],
            VERSION_TIMEOUT,
        )
        .ok()?;
    if done.timed_out || done.exit_code != Some(0) {
        return None;
    }
    parse_version(&done.output)
}

/// Looks for one agent program in the folders of `search_path`.
#[must_use]
pub fn detect(
    supervisor: &Supervisor,
    cli: AgentCli,
    search_path: &OsStr,
    path_ext: &OsStr,
) -> Detection {
    let found = resolve::resolve(cli.program(), search_path, path_ext);
    let version = found
        .as_ref()
        .and_then(|program| version_of(supervisor, cli, program));
    let claude = cli == AgentCli::Claude;
    Detection {
        cli,
        installed: found.is_some(),
        path: found
            .as_ref()
            .map(|program| program.path.display().to_string()),
        too_old: claude
            && version
                .as_deref()
                .is_some_and(|version| !recent_enough(version)),
        version,
        minimum_version: claude.then(|| MINIMUM_VERSION.to_owned()),
        signed_in: found
            .as_ref()
            .filter(|_| claude)
            .and_then(|program| signed_in_of(supervisor, program)),
        install_url: cli.install_url().to_owned(),
    }
}

/// Looks for every agent program with the `PATH` and `PATHEXT` of this process.
#[must_use]
pub fn detect_all(supervisor: &Supervisor) -> Vec<Detection> {
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    let path_ext = std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    AgentCli::ALL
        .into_iter()
        .map(|cli| detect(supervisor, cli, &search_path, &path_ext))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_version_from_the_way_each_program_words_it() {
        for (output, version) in [
            ("2.1.5 (Claude Code)\r\n", "2.1.5"),
            ("codex-cli 0.46.0\n", "0.46.0"),
            ("v1.2.3", "1.2.3"),
            ("claude version 3.0.0-beta.2 (build 77)", "3.0.0-beta.2"),
            ("\n\n  10.20.30  \n", "10.20.30"),
            ("Tool 1.0", "1.0"),
        ] {
            assert_eq!(
                parse_version(output).as_deref(),
                Some(version),
                "{output:?}"
            );
        }
    }

    #[test]
    fn finds_no_version_where_there_is_none() {
        for output in [
            "",
            "   \n",
            "error: unknown option --version",
            "usage: claude [options]",
            "1",
            "1.2.3.4.5",
            "abc.def",
            "12345678.1",
        ] {
            assert_eq!(parse_version(output), None, "{output:?}");
        }
    }

    #[test]
    fn reads_only_whether_claude_code_is_signed_in() {
        assert_eq!(
            parse_signed_in(
                "{\n  \"loggedIn\": true,\n  \"authMethod\": \"claude.ai\",\n  \"email\": \"ada@example.com\"\n}\n"
            ),
            Some(true)
        );
        assert_eq!(
            parse_signed_in(r#"{"loggedIn":false,"authMethod":"none"}"#),
            Some(false)
        );
        assert_eq!(parse_signed_in("Not logged in"), None);
        assert_eq!(parse_signed_in(""), None);
    }

    #[test]
    fn each_agent_has_a_program_name_and_an_install_page() {
        assert_eq!(AgentCli::Claude.program(), "claude");
        assert_eq!(AgentCli::Codex.program(), "codex");
        for cli in AgentCli::ALL {
            assert!(cli.install_url().starts_with("https://"));
        }
    }

    #[cfg(windows)]
    mod on_windows {
        use std::fs;

        use super::*;

        fn supervisor() -> (Supervisor, tempfile::TempDir) {
            let logs = tempfile::tempdir().expect("a temporary folder");
            (
                Supervisor::new(logs.path().join("agents")).expect("a supervisor"),
                logs,
            )
        }

        #[test]
        fn reports_an_agent_that_is_installed_with_its_path_and_version() {
            let (supervisor, _logs) = supervisor();
            let bin = tempfile::tempdir().expect("a temporary folder");
            fs::write(
                bin.path().join("claude.cmd"),
                "@echo off\r\necho 2.1.5 (Claude Code)\r\n",
            )
            .expect("a script");

            let found = detect(
                &supervisor,
                AgentCli::Claude,
                bin.path().as_os_str(),
                OsStr::new(".EXE;.CMD"),
            );

            assert!(found.installed);
            assert_eq!(found.version.as_deref(), Some("2.1.5"));
            assert_eq!(
                found.path.as_deref(),
                Some(bin.path().join("claude.cmd").display().to_string().as_str())
            );
            assert_eq!(found.install_url, "https://code.claude.com/docs/en/setup");
        }

        /// A `claude.cmd` that says its version and whether it is signed in.
        fn claude_script(version: &str, signed_in: bool) -> tempfile::TempDir {
            let bin = tempfile::tempdir().expect("a temporary folder");
            fs::write(
                bin.path().join("claude.cmd"),
                format!(
                    "@echo off\r\nif \"%1\"==\"auth\" goto auth\r\necho {version} (Claude Code)\r\nexit /b 0\r\n:auth\r\necho {{\"loggedIn\": {signed_in}, \"email\": \"ada@example.com\"}}\r\nexit /b {}\r\n",
                    u8::from(!signed_in)
                ),
            )
            .expect("a script");
            bin
        }

        #[test]
        fn says_whether_claude_code_is_signed_in_and_recent_enough() {
            let (supervisor, logs) = supervisor();
            for (version, signed_in, too_old) in [
                ("2.1.286", true, false),
                ("2.1.286", false, false),
                ("2.1.100", true, true),
            ] {
                let bin = claude_script(version, signed_in);

                let found = detect(
                    &supervisor,
                    AgentCli::Claude,
                    bin.path().as_os_str(),
                    OsStr::new(".EXE;.CMD"),
                );

                assert_eq!(found.version.as_deref(), Some(version));
                assert_eq!(found.signed_in, Some(signed_in), "{version} {signed_in}");
                assert_eq!(found.too_old, too_old, "{version}");
                assert_eq!(found.minimum_version.as_deref(), Some(MINIMUM_VERSION));
            }
            // The account's email never reaches a log.
            for entry in fs::read_dir(logs.path().join("agents")).expect("the logs") {
                let log = fs::read_to_string(entry.expect("a log").path()).expect("a log");
                assert!(!log.contains("ada@example.com"), "{log}");
            }
        }

        #[test]
        fn claude_code_that_is_not_installed_is_neither_signed_in_nor_out() {
            let (supervisor, _logs) = supervisor();
            let empty = tempfile::tempdir().expect("a temporary folder");

            let found = detect(
                &supervisor,
                AgentCli::Claude,
                empty.path().as_os_str(),
                OsStr::new(".EXE;.CMD"),
            );

            assert!(!found.installed);
            assert_eq!(found.signed_in, None);
            assert!(!found.too_old);
            assert_eq!(found.minimum_version.as_deref(), Some(MINIMUM_VERSION));
        }

        #[test]
        fn reports_an_agent_that_is_not_installed() {
            let (supervisor, _logs) = supervisor();
            let empty = tempfile::tempdir().expect("a temporary folder");

            let found = detect(
                &supervisor,
                AgentCli::Codex,
                empty.path().as_os_str(),
                OsStr::new(".EXE;.CMD"),
            );

            assert!(!found.installed);
            assert_eq!(found.path, None);
            assert_eq!(found.version, None);
            assert_eq!(found.install_url, "https://github.com/openai/codex");
        }

        #[test]
        fn an_installed_agent_whose_version_cannot_be_read_is_still_installed() {
            let (supervisor, _logs) = supervisor();
            let bin = tempfile::tempdir().expect("a temporary folder");
            fs::write(
                bin.path().join("codex.cmd"),
                "@echo off\r\necho this is not a version\r\nexit /b 1\r\n",
            )
            .expect("a script");

            let found = detect(
                &supervisor,
                AgentCli::Codex,
                bin.path().as_os_str(),
                OsStr::new(".EXE;.CMD"),
            );

            assert!(found.installed);
            assert_eq!(found.version, None);
        }

        #[test]
        fn a_real_program_is_preferred_to_the_wrapper_and_asked_for_its_version() {
            let (supervisor, _logs) = supervisor();
            let npm = tempfile::tempdir().expect("a temporary folder");
            let local = tempfile::tempdir().expect("a temporary folder");
            fs::write(npm.path().join("claude.cmd"), "@echo off\r\necho 9.9.9\r\n")
                .expect("a script");
            // Any real program will do as the stand-in: it is only asked for its version.
            let stand_in = resolve::resolve_from_environment("hostname").expect("hostname exists");
            fs::copy(&stand_in.path, local.path().join("claude.exe")).expect("a copy");
            let folders = std::env::join_paths([npm.path(), local.path()]).expect("folders");

            let found = detect(
                &supervisor,
                AgentCli::Claude,
                &folders,
                OsStr::new(".EXE;.CMD"),
            );

            assert_eq!(
                found.path.as_deref(),
                Some(
                    local
                        .path()
                        .join("claude.exe")
                        .display()
                        .to_string()
                        .as_str()
                )
            );
            // The wrapper says 9.9.9. Getting anything else, or nothing, shows the real program was asked.
            assert_ne!(found.version.as_deref(), Some("9.9.9"));
        }
    }
}
