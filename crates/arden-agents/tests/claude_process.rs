//! The Claude driver with a real process (ADR 0038): the workspace's stand-in for Claude Code, found
//! on a `PATH` of its own and started through the supervisor, as the app starts the person's
//! `claude`.

#![cfg(windows)]

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use arden_agents::claude::driver::ClaudeDriver;
use arden_agents::claude::launch::ProgramLauncher;
use arden_agents::model::{AgentKind, Item, Turn, TurnStatus};
use arden_agents::playground;
use arden_agents::store::SessionStore;
use arden_agents::usage::{UsageReport, UsageWindowKind};
use arden_core::error::ErrorCode;
use arden_process::supervisor::Supervisor;
use serde_json::{Value, json};

/// A folder that holds the stand-in as `claude.exe`, with its settings beside it.
fn claude_on_path(settings: &Value) -> tempfile::TempDir {
    let bin = tempfile::tempdir().expect("a folder");
    std::fs::copy(
        env!("CARGO_BIN_EXE_claude-stand-in"),
        bin.path().join("claude.exe"),
    )
    .expect("the stand-in");
    std::fs::write(bin.path().join("stand-in.json"), settings.to_string()).expect("its settings");
    bin
}

/// Sends a message to a new Claude session in `project`, with the stand-in in `bin`.
fn send(bin: &Path, project: &Path, prompt: &str) -> Turn {
    let logs = tempfile::tempdir().expect("a folder");
    let supervisor = Arc::new(Supervisor::new(logs.path()).expect("a supervisor"));
    let launcher = ProgramLauncher::with_search_path(supervisor, bin.as_os_str().to_owned());
    let driver = ClaudeDriver::new(Arc::new(launcher));
    let store = SessionStore::new(vec![playground::describe(project)]);
    let session = store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Claude)
        .expect("a session");
    let turn = store.start_turn(&session.id, prompt).expect("a turn");
    store
        .stream_reply(&driver, &session.id, &turn, |_| true)
        .expect("saved");
    store.session(&session.id).expect("the session").turns[0].clone()
}

#[test]
fn claude_answers_through_a_real_process_started_in_the_projects_folder() {
    let project = tempfile::tempdir().expect("a folder");
    let log = project.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log }));

    let turn = send(bin.path(), project.path(), "Hello there");

    assert_eq!(turn.status, TurnStatus::Done, "{:#?}", turn.items);
    assert!(
        turn.items
            .iter()
            .any(|item| matches!(item, Item::Text { text, .. } if text == "You said: Hello there")),
        "{:#?}",
        turn.items
    );
    let log = std::fs::read_to_string(log).expect("the stand-in's log");
    let started: Value = log
        .lines()
        .filter_map(|line| line.strip_prefix("start "))
        .filter_map(|start| serde_json::from_str(start).ok())
        .find(|start: &Value| {
            start["args"]
                .as_array()
                .is_some_and(|args| args.iter().any(|arg| arg == "-p"))
        })
        .expect("the conversation was started");
    let args: Vec<&str> = started["args"]
        .as_array()
        .expect("arguments")
        .iter()
        .filter_map(Value::as_str)
        .collect();
    for (flag, value) in [
        ("--input-format", "stream-json"),
        ("--output-format", "stream-json"),
        ("--permission-prompt-tool", "stdio"),
        ("--permission-mode", "default"),
    ] {
        let at = args.iter().position(|arg| *arg == flag).expect(flag);
        assert_eq!(args[at + 1], value, "{flag}");
    }
    assert!(args.contains(&"--verbose") && args.contains(&"--include-partial-messages"));
    assert!(
        !args.contains(&"--bare"),
        "the person's own sign-in and settings load"
    );
    let session = args
        .iter()
        .position(|arg| *arg == "--session-id")
        .expect("a conversation id");
    assert!(uuid::Uuid::parse_str(args[session + 1]).is_ok());
    let folder = started["folder"].as_str().expect("the folder it ran in");
    assert_eq!(
        std::fs::canonicalize(folder).expect("a folder"),
        std::fs::canonicalize(project.path()).expect("a folder")
    );
}

#[test]
fn a_claude_code_older_than_the_minimum_is_not_started() {
    let project = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "version": "2.1.100" }));

    let turn = send(bin.path(), project.path(), "Hello");

    assert_eq!(turn.status, TurnStatus::Failed);
    assert!(matches!(
        &turn.items[..],
        [Item::Error {
            code: Some(ErrorCode::ClaudeTooOld),
            ..
        }]
    ));
}

#[test]
fn no_claude_on_path_is_not_installed() {
    let project = tempfile::tempdir().expect("a folder");
    let empty = tempfile::tempdir().expect("a folder");

    let turn = send(empty.path(), project.path(), "Hello");

    assert!(matches!(
        &turn.items[..],
        [Item::Error {
            code: Some(ErrorCode::ClaudeNotInstalled),
            ..
        }]
    ));
}

/// A Claude driver that starts `claude` from `bin`, or from the `PATH` with none, and asks for the
/// usage limits (ADR 0043).
fn asking_driver(bin: Option<&Path>) -> (ClaudeDriver, tempfile::TempDir) {
    let logs = tempfile::tempdir().expect("a folder");
    let supervisor = Arc::new(Supervisor::new(logs.path()).expect("a supervisor"));
    let launcher = match bin {
        Some(bin) => ProgramLauncher::with_search_path(supervisor, bin.as_os_str().to_owned()),
        None => ProgramLauncher::new(supervisor),
    };
    let driver = ClaudeDriver::new(Arc::new(launcher));
    driver.ask_for_usage(true);
    (driver, logs)
}

#[test]
fn the_usage_limits_come_from_a_real_process_started_only_to_ask() {
    let project = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({
        "usage": {
            "rate_limits_available": true,
            "rate_limits": {
                "five_hour": { "utilization": 42, "resets_at": "2099-10-09T15:10:00+00:00" },
                "seven_day": { "utilization": 18, "resets_at": "2099-10-13T09:00:00+00:00" }
            }
        }
    }));
    let (driver, _logs) = asking_driver(Some(bin.path()));

    let limits = driver.refresh_usage(project.path(), Duration::ZERO);

    assert_eq!(limits.report, UsageReport::Reported);
    assert_eq!(
        limits
            .windows
            .iter()
            .map(|window| (window.kind, window.percent))
            .collect::<Vec<_>>(),
        [
            (UsageWindowKind::FiveHour, 42),
            (UsageWindowKind::Weekly, 18)
        ]
    );
}

/// Run by the maintainer, with `cargo test -p arden-agents --test claude_process -- --ignored`:
/// the person's own signed-in `claude` on the `PATH` answers `get_usage`, and one message shows
/// whether a `rate_limit_event` carries a percentage on an ordinary turn (ADR 0043). The message is
/// a real call to the model. Arden Code never signs in.
#[test]
#[ignore = "needs a real, signed-in claude on the PATH, and sends it one message"]
fn a_real_signed_in_claude_code_reports_its_usage_limits() {
    let project = tempfile::tempdir().expect("a folder");
    let (driver, _logs) = asking_driver(None);

    let asked = driver.refresh_usage(project.path(), Duration::ZERO);
    println!("get_usage: {asked:#?}");
    assert_ne!(asked.report, UsageReport::Unknown, "claude answered");

    let store = SessionStore::new(vec![playground::describe(project.path())]);
    let session = store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Claude)
        .expect("a session");
    let turn = store
        .start_turn(&session.id, "Say hi, in one word.")
        .expect("a turn");
    store
        .stream_reply(&driver, &session.id, &turn, |_| true)
        .expect("saved");
    std::thread::sleep(Duration::from_secs(5));
    println!("after a turn: {:#?}", driver.usage_limits());
}
