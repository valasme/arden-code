//! Claude's plugins through the person's own Claude Code (ADR 0053): the workspace's stand-in for
//! Claude Code, found on a `PATH` of its own and run through the supervisor, as the app runs it.

#![cfg(windows)]

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use arden_agents::claude::plugins::{ClaudePlugins, PluginError, PluginScope};
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

/// The plugins module with the stand-in in `bin`, the Playground in `playground` and the logs in
/// `logs`.
fn plugins(bin: &Path, playground: &Path, logs: &Path) -> ClaudePlugins {
    let supervisor = Arc::new(Supervisor::new(logs).expect("a supervisor"));
    ClaudePlugins::with_search_path(supervisor, playground, bin.as_os_str().to_owned())
}

/// How the stand-in was started for each `plugin` command: its arguments and its folder.
fn plugin_starts(log: &Path) -> Vec<Value> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| line.strip_prefix("start "))
        .filter_map(|start| serde_json::from_str::<Value>(start).ok())
        .filter(|start| start["args"][0] == "plugin")
        .collect()
}

fn same_folder(a: &str, b: &Path) -> bool {
    std::fs::canonicalize(a).ok() == std::fs::canonicalize(b).ok()
}

const SECRET: &str = "ghp_secret_token_1234";

fn installed_list() -> Value {
    json!([
        {
            "id": "superpowers@claude-plugins-official",
            "version": "4.3.1",
            "scope": "user",
            "enabled": true,
            "installPath": "C:\\Users\\Ada\\.claude\\plugins\\cache\\superpowers",
            "installedAt": "2026-10-01T09:00:00Z",
            "mcpServers": { "github": { "command": "npx", "env": { "GITHUB_TOKEN": SECRET } } },
            "hasUserConfig": true
        },
        {
            "id": "deploy@acme",
            "version": "0.9.2",
            "scope": "project",
            "enabled": false,
            "installPath": "C:\\cache\\deploy",
            "projectPath": "C:\\Work\\billing-api",
            "errors": ["The hook script was not found", { "message": "A server did not start" }]
        },
        { "id": "notes@synced", "version": "1.0.0", "scope": "synced", "enabled": true, "installPath": "x" },
        { "id": "policy@corp", "version": "2.0.0", "scope": "managed", "enabled": true, "installPath": "y", "futureField": 1 }
    ])
}

#[test]
fn the_installed_plugins_are_read_from_claude_code_run_in_the_playground() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "installed": installed_list() } }));

    let found = plugins(bin.path(), playground.path(), logs.path())
        .installed()
        .expect("the list");

    assert_eq!(found.len(), 4);
    let superpowers = &found[0];
    assert_eq!(superpowers.id, "superpowers@claude-plugins-official");
    assert_eq!(superpowers.name, "superpowers");
    assert_eq!(superpowers.marketplace, "claude-plugins-official");
    assert_eq!(superpowers.scope, PluginScope::User);
    assert_eq!(superpowers.version.as_deref(), Some("4.3.1"));
    assert!(superpowers.enabled);
    let deploy = &found[1];
    assert_eq!(deploy.scope, PluginScope::Project);
    assert_eq!(
        deploy.project_path.as_deref(),
        Some("C:\\Work\\billing-api")
    );
    assert!(!deploy.enabled);
    assert_eq!(
        deploy.errors,
        ["The hook script was not found", "A server did not start"]
    );
    assert_eq!(found[2].scope, PluginScope::Synced);
    assert_eq!(found[3].scope, PluginScope::Managed);

    let starts = plugin_starts(&log);
    assert_eq!(starts.len(), 1);
    assert_eq!(starts[0]["args"], json!(["plugin", "list", "--json"]));
    assert!(same_folder(
        starts[0]["folder"].as_str().unwrap_or_default(),
        playground.path()
    ));
}

#[test]
fn a_servers_environment_never_reaches_the_answer_or_the_log() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "installed": installed_list() } }));

    let found = plugins(bin.path(), playground.path(), logs.path())
        .installed()
        .expect("the list");

    assert!(
        !serde_json::to_string(&found)
            .expect("json")
            .contains(SECRET)
    );
    for entry in walk(logs.path()) {
        let text = std::fs::read_to_string(&entry).unwrap_or_default();
        assert!(!text.contains(SECRET), "{}: {text}", entry.display());
    }
}

fn walk(folder: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(folder).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.is_dir() {
            files.extend(walk(&path));
        } else {
            files.push(path);
        }
    }
    files
}

#[test]
fn a_claude_code_older_than_2_1_268_is_refused_before_any_plugin_command_runs() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "version": "2.1.250" }));

    let refused = plugins(bin.path(), playground.path(), logs.path()).installed();

    assert_eq!(refused, Err(PluginError::TooOld("2.1.250".into())));
    assert!(plugin_starts(&log).is_empty());
}

#[test]
fn without_claude_code_the_plugins_cannot_be_read() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let empty = tempfile::tempdir().expect("a folder");

    assert_eq!(
        plugins(empty.path(), playground.path(), logs.path()).installed(),
        Err(PluginError::NotInstalled)
    );
}

#[test]
fn an_answer_arden_code_does_not_understand_is_said_so() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "installed": "not a list" } }));

    assert_eq!(
        plugins(bin.path(), playground.path(), logs.path()).installed(),
        Err(PluginError::NotUnderstood)
    );
}

#[test]
fn a_command_that_takes_too_long_is_ended_and_reported() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "delayMs": 5_000 } }));

    let refused = plugins(bin.path(), playground.path(), logs.path())
        .with_patience(Duration::from_millis(500))
        .installed();

    assert_eq!(refused, Err(PluginError::TooLong));
}

#[test]
fn plugin_commands_run_one_at_a_time() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "delayMs": 400 } }));
    let module = Arc::new(plugins(bin.path(), playground.path(), logs.path()));

    let other = {
        let module = Arc::clone(&module);
        std::thread::spawn(move || module.installed())
    };
    let mine = module.installed();
    let theirs = other.join().expect("the other thread");

    assert!(mine.is_ok() && theirs.is_ok());
    let order: Vec<String> = std::fs::read_to_string(&log)
        .expect("the log")
        .lines()
        .filter(|line| {
            line.starts_with("start ") && line.contains("\"plugin\"") || *line == "plugin-end"
        })
        .map(|line| {
            if line == "plugin-end" {
                "end".into()
            } else {
                "start".into()
            }
        })
        .collect();
    assert_eq!(order, ["start", "end", "start", "end"]);
}

fn catalog() -> Value {
    json!([
        {
            "pluginId": "adobe-for-creativity@claude-plugins-official",
            "name": "adobe-for-creativity",
            "description": "Adobe's creative tools.",
            "marketplaceName": "claude-plugins-official",
            "source": {
                "source": "git-subdir",
                "url": "https://github.com/adobe/skills.git",
                "path": "plugins/creative-cloud/adobe-for-creativity",
                "ref": "main",
                "sha": "acb6d76475e6c522a5b109d2df7c8a794ee74ea7"
            },
            "installCount": 3952,
            "version": "1.2.0"
        },
        {
            "pluginId": "agent-sdk-dev@claude-plugins-official",
            "name": "agent-sdk-dev",
            "marketplaceName": "claude-plugins-official",
            "source": "./plugins/agent-sdk-dev",
            "somethingNew": true
        }
    ])
}

#[test]
fn the_catalog_is_read_once_kept_to_the_shown_fields_and_read_again_when_asked() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "available": catalog() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    let first = module.catalog(false).expect("the catalog");
    let kept = module.catalog(false).expect("the catalog");
    let again = module.catalog(true).expect("the catalog");

    assert_eq!(first, kept);
    assert_eq!(first, again);
    assert_eq!(first.len(), 2);
    let adobe = &first[0];
    assert_eq!(adobe.id, "adobe-for-creativity@claude-plugins-official");
    assert_eq!(adobe.name, "adobe-for-creativity");
    assert_eq!(adobe.marketplace, "claude-plugins-official");
    assert_eq!(
        adobe.description.as_deref(),
        Some("Adobe's creative tools.")
    );
    assert_eq!(adobe.version.as_deref(), Some("1.2.0"));
    assert_eq!(adobe.installs, Some(3952));
    assert_eq!(
        adobe.source,
        "https://github.com/adobe/skills.git · plugins/creative-cloud/adobe-for-creativity · main"
    );
    let sdk = &first[1];
    assert_eq!(sdk.description, None);
    assert_eq!(sdk.installs, None);
    assert_eq!(sdk.source, "./plugins/agent-sdk-dev");

    let starts = plugin_starts(&log);
    assert_eq!(starts.len(), 2, "read once, then again when asked");
    assert_eq!(
        starts[0]["args"],
        json!(["plugin", "list", "--json", "--available"])
    );
}
