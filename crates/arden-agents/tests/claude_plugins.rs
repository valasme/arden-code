//! Claude's plugins through the person's own Claude Code (ADR 0053): the workspace's stand-in for
//! Claude Code, found on a `PATH` of its own and run through the supervisor, as the app runs it.

#![cfg(any(windows, target_os = "linux"))]

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use arden_agents::claude::plugins::{
    ClaudePlugins, MarketplaceAction, PluginAction, PluginError, PluginScope, ShownCommand,
};
use arden_process::supervisor::Supervisor;
use serde_json::{Value, json};

/// A folder that holds the stand-in as `claude` (`claude.exe` on Windows), with its settings beside
/// it.
fn claude_on_path(settings: &Value) -> tempfile::TempDir {
    let bin = tempfile::tempdir().expect("a folder");
    std::fs::copy(
        env!("CARGO_BIN_EXE_claude-stand-in"),
        bin.path()
            .join(format!("claude{}", std::env::consts::EXE_SUFFIX)),
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

#[test]
fn a_plugin_is_installed_for_the_person_in_every_project_from_the_playground() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "available": catalog() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    let done = module
        .install(
            "adobe-for-creativity@claude-plugins-official",
            PluginScope::User,
            None,
            None,
        )
        .expect("installed");

    assert_eq!(
        done.message,
        "Successfully installed plugin: adobe-for-creativity@claude-plugins-official (scope: user)"
    );
    let starts = plugin_starts(&log);
    assert_eq!(
        starts[0]["args"],
        json!([
            "plugin",
            "install",
            "adobe-for-creativity@claude-plugins-official",
            "--scope",
            "user",
            "--json"
        ])
    );
    assert!(same_folder(
        starts[0]["folder"].as_str().unwrap_or_default(),
        playground.path()
    ));
    let installed = module.installed().expect("the list");
    assert_eq!(
        installed[0].id,
        "adobe-for-creativity@claude-plugins-official"
    );
    assert_eq!(installed[0].version.as_deref(), Some("1.2.0"));
}

#[test]
fn an_id_that_is_not_a_plain_name_at_marketplace_is_refused_before_anything_runs() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log }));
    let module = plugins(bin.path(), playground.path(), logs.path());
    let too_long = format!("{}@market", "a".repeat(122));

    for id in [
        "superpowers",
        "a@b@c",
        "@market",
        "name@",
        "-flag@market",
        "two words@market",
        "semi;colon@market",
        "quote\"d@market",
        too_long.as_str(),
    ] {
        assert_eq!(
            module.install(id, PluginScope::User, None, None),
            Err(PluginError::InvalidId),
            "{id} was not refused"
        );
    }
    assert!(plugin_starts(&log).is_empty());
    assert!(
        module
            .install(
                &format!("{}@market", "a".repeat(121)),
                PluginScope::User,
                None,
                None
            )
            .is_ok()
    );
}

#[test]
fn a_failed_install_says_claude_codes_message_and_code() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "failures": {
        "missing@claude-plugins-official": { "message": "Plugin not found in marketplace", "failureCode": "plugin_not_found" }
    } } }));

    let refused = plugins(bin.path(), playground.path(), logs.path()).install(
        "missing@claude-plugins-official",
        PluginScope::User,
        None,
        None,
    );

    assert_eq!(
        refused,
        Err(PluginError::Failed {
            message: "Plugin not found in marketplace".into(),
            code: Some("plugin_not_found".into())
        })
    );
}

#[test]
fn a_plugin_installed_already_reads_as_success() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "installed": installed_list() } }));

    let done = plugins(bin.path(), playground.path(), logs.path())
        .install(
            "superpowers@claude-plugins-official",
            PluginScope::User,
            None,
            None,
        )
        .expect("success");

    assert!(
        done.message.contains("already installed"),
        "{}",
        done.message
    );
}

#[test]
fn the_catalog_is_read_again_after_a_change() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "available": catalog() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    module.catalog(false).expect("the catalog");
    module
        .install(
            "agent-sdk-dev@claude-plugins-official",
            PluginScope::User,
            None,
            None,
        )
        .expect("installed");
    module.catalog(false).expect("the catalog");

    let lists = plugin_starts(&log)
        .iter()
        .filter(|start| start["args"][1] == "list")
        .count();
    assert_eq!(lists, 2);
}

#[test]
fn an_installed_plugin_is_turned_off_and_on_updated_and_uninstalled_at_its_scope() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "installed": installed_list() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());
    let id = "superpowers@claude-plugins-official";

    module
        .change(PluginAction::Disable, id, PluginScope::User, None, None)
        .expect("off");
    assert!(!module.installed().expect("the list")[0].enabled);
    module
        .change(PluginAction::Enable, id, PluginScope::User, None, None)
        .expect("on");
    module
        .change(PluginAction::Update, id, PluginScope::User, None, None)
        .expect("updated");
    assert_eq!(
        module.installed().expect("the list")[0].version.as_deref(),
        Some("4.3.2")
    );
    module
        .change(PluginAction::Uninstall, id, PluginScope::User, None, None)
        .expect("gone");
    assert!(
        module
            .installed()
            .expect("the list")
            .iter()
            .all(|plugin| plugin.id != id)
    );

    let commands: Vec<Value> = plugin_starts(&log)
        .into_iter()
        .filter(|start| start["args"][1] != "list")
        .map(|start| start["args"].clone())
        .collect();
    assert_eq!(
        commands,
        [
            json!(["plugin", "disable", id, "--scope", "user", "--json"]),
            json!(["plugin", "enable", id, "--scope", "user", "--json"]),
            json!(["plugin", "update", id, "--scope", "user", "--json"]),
            json!(["plugin", "uninstall", id, "--scope", "user", "--json"]),
        ]
    );
}

#[test]
fn a_project_plugin_is_changed_in_its_projects_folder() {
    let playground = tempfile::tempdir().expect("a folder");
    let project = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let installed = json!([{
        "id": "deploy@acme", "version": "0.9.2", "scope": "project", "enabled": true,
        "installPath": "x", "projectPath": project.path().display().to_string()
    }]);
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "installed": installed } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    module
        .change(
            PluginAction::Disable,
            "deploy@acme",
            PluginScope::Project,
            Some(project.path()),
            None,
        )
        .expect("off");

    let start = plugin_starts(&log)
        .into_iter()
        .find(|start| start["args"][1] == "disable")
        .expect("disabled");
    assert_eq!(
        start["args"],
        json!([
            "plugin",
            "disable",
            "deploy@acme",
            "--scope",
            "project",
            "--json"
        ])
    );
    assert!(same_folder(
        start["folder"].as_str().unwrap_or_default(),
        project.path()
    ));
}

#[test]
fn turning_on_a_plugin_that_is_on_reads_as_success() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "installed": installed_list() } }));

    let done = plugins(bin.path(), playground.path(), logs.path()).change(
        PluginAction::Enable,
        "superpowers@claude-plugins-official",
        PluginScope::User,
        None,
        None,
    );

    assert!(done.is_ok(), "{done:?}");
}

#[test]
fn only_what_a_synced_or_managed_plugin_allows_is_run() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "installed": installed_list() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    assert_eq!(
        module.change(
            PluginAction::Uninstall,
            "notes@synced",
            PluginScope::Synced,
            None,
            None
        ),
        Err(PluginError::NotChangeable)
    );
    assert_eq!(
        module.change(
            PluginAction::Disable,
            "policy@corp",
            PluginScope::Managed,
            None,
            None
        ),
        Err(PluginError::NotChangeable)
    );
    assert_eq!(
        module.change(
            PluginAction::Disable,
            "deploy@acme",
            PluginScope::Project,
            None,
            None
        ),
        Err(PluginError::NotChangeable),
        "a project plugin needs its project's folder"
    );
    assert!(plugin_starts(&log).is_empty());
    module
        .change(
            PluginAction::Disable,
            "notes@synced",
            PluginScope::Synced,
            None,
            None,
        )
        .expect("a synced plugin can be turned off");
    let start = plugin_starts(&log).pop().expect("disabled");
    assert_eq!(
        start["args"],
        json!(["plugin", "disable", "notes@synced", "--json"])
    );
}

#[test]
fn a_plugin_is_installed_for_a_project_in_its_folder_at_the_scope_chosen() {
    let playground = tempfile::tempdir().expect("a folder");
    let project = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log, "plugins": { "available": catalog() } }));
    let module = plugins(bin.path(), playground.path(), logs.path());
    let id = "adobe-for-creativity@claude-plugins-official";

    module
        .install(id, PluginScope::Project, Some(project.path()), None)
        .expect("for everyone in the project");
    module
        .install(id, PluginScope::Local, Some(project.path()), None)
        .expect("for the person in the project");

    let installs: Vec<Value> = plugin_starts(&log)
        .into_iter()
        .filter(|start| start["args"][1] == "install")
        .collect();
    assert_eq!(
        installs[0]["args"],
        json!(["plugin", "install", id, "--scope", "project", "--json"])
    );
    assert_eq!(
        installs[1]["args"],
        json!(["plugin", "install", id, "--scope", "local", "--json"])
    );
    for install in &installs {
        assert!(same_folder(
            install["folder"].as_str().unwrap_or_default(),
            project.path()
        ));
    }
    let installed = module.installed().expect("the list");
    assert!(installed.iter().any(|plugin| {
        plugin.scope == PluginScope::Project
            && plugin
                .project_path
                .as_deref()
                .is_some_and(|path| same_folder(path, project.path()))
    }));
}

#[test]
fn a_project_install_needs_its_projects_folder_and_another_scope_is_refused() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    for scope in [PluginScope::Project, PluginScope::Local] {
        assert_eq!(
            module.install("x@market", scope, None, None),
            Err(PluginError::NotChangeable)
        );
    }
    assert_eq!(
        module.install(
            "x@market",
            PluginScope::Managed,
            Some(playground.path()),
            None
        ),
        Err(PluginError::NotChangeable)
    );
    assert!(plugin_starts(&log).is_empty());
}

const DECLARED: &str = "npx -y @acme/deploy-cli@0.9.2 setup --cluster staging";

#[test]
fn a_command_the_marketplace_declares_is_shown_and_nothing_is_installed() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "commands": { "deploy@acme": DECLARED } } }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    let shown = module
        .install("deploy@acme", PluginScope::User, None, None)
        .expect("an answer");

    let ShownCommand {
        command,
        plugin,
        sha256,
        changed,
    } = shown.shown_command.expect("the command to accept");
    assert_eq!(command, DECLARED);
    assert_eq!(plugin, "deploy@acme");
    assert_eq!(sha256.len(), 64);
    assert!(!changed);
    assert!(module.installed().expect("the list").is_empty());
}

#[test]
fn accepting_passes_exactly_its_sha256_and_installs() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(
        &json!({ "log": log, "plugins": { "commands": { "deploy@acme": DECLARED } } }),
    );
    let module = plugins(bin.path(), playground.path(), logs.path());
    let shown = module
        .install("deploy@acme", PluginScope::User, None, None)
        .expect("an answer")
        .shown_command
        .expect("the command");

    let done = module
        .install("deploy@acme", PluginScope::User, None, Some(&shown.sha256))
        .expect("installed");

    assert!(done.shown_command.is_none());
    let start = plugin_starts(&log).pop().expect("the second install");
    assert_eq!(
        start["args"],
        json!([
            "plugin",
            "install",
            "deploy@acme",
            "--scope",
            "user",
            "--accept-command",
            shown.sha256,
            "--json"
        ])
    );
    assert!(
        start["args"]
            .as_array()
            .is_some_and(|args| args.iter().all(|arg| arg != "--yes" && arg != "-y"))
    );
    assert_eq!(module.installed().expect("the list")[0].id, "deploy@acme");
}

#[test]
fn a_sha256_that_no_longer_matches_shows_the_new_command_again() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "plugins": { "commands": { "deploy@acme": DECLARED } } }));
    let module = plugins(bin.path(), playground.path(), logs.path());
    let stale = "0123456789abcdef".repeat(4);

    let shown = module
        .install("deploy@acme", PluginScope::User, None, Some(&stale))
        .expect("an answer")
        .shown_command
        .expect("shown again");

    assert!(shown.changed);
    assert_ne!(shown.sha256, stale);
}

#[test]
fn a_sha256_that_is_not_one_is_refused_before_anything_runs() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = claude_on_path(&json!({ "log": log }));
    let module = plugins(bin.path(), playground.path(), logs.path());

    for sha256 in ["--yes", "abc", &"g".repeat(64)] {
        assert_eq!(
            module.install("deploy@acme", PluginScope::User, None, Some(sha256)),
            Err(PluginError::InvalidId)
        );
    }
    assert!(plugin_starts(&log).is_empty());
}

#[test]
fn accepting_a_command_needs_claude_code_2_1_271() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "version": "2.1.270" }));

    assert_eq!(
        plugins(bin.path(), playground.path(), logs.path()).install(
            "deploy@acme",
            PluginScope::User,
            None,
            Some(&"a".repeat(64))
        ),
        Err(PluginError::TooOld("2.1.270".into()))
    );
}

fn marketplaces() -> Value {
    json!([
        { "name": "claude-plugins-official", "source": "github", "repo": "anthropics/claude-plugins-official", "installLocation": "C:\\cache\\official" },
        { "name": "acme", "source": "git", "url": "https://git.acme.example/platform/marketplace.git", "ref": "main", "installLocation": "C:\\cache\\acme" }
    ])
}

/// A stand-in recent enough for the marketplace commands' `--json` (2.1.287).
fn marketplace_claude(log: &Path, extra: &Value) -> tempfile::TempDir {
    let mut plugins = json!({ "marketplaces": marketplaces(), "installed": installed_list() });
    if let (Some(plugins), Some(extra)) = (plugins.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            plugins.insert(key.clone(), value.clone());
        }
    }
    claude_on_path(&json!({ "log": log, "version": "2.1.292", "plugins": plugins }))
}

#[test]
fn the_marketplaces_are_listed_with_where_they_come_from() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = marketplace_claude(&log, &json!({}));

    let found = plugins(bin.path(), playground.path(), logs.path())
        .marketplaces()
        .expect("the list");

    assert_eq!(found.len(), 2);
    assert_eq!(found[0].name, "claude-plugins-official");
    assert_eq!(found[0].source, "anthropics/claude-plugins-official");
    assert_eq!(
        found[1].source,
        "https://git.acme.example/platform/marketplace.git · main"
    );
    assert_eq!(
        plugin_starts(&log)[0]["args"],
        json!(["plugin", "marketplace", "list", "--json"])
    );
}

#[test]
fn a_marketplace_is_added_updated_and_removed_and_removing_uninstalls_its_plugins() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = marketplace_claude(&log, &json!({}));
    let module = plugins(bin.path(), playground.path(), logs.path());

    let added = module.add_marketplace("mattpocock/skills").expect("added");
    assert_eq!(added.message, "Successfully added marketplace: skills");
    module
        .change_marketplace(MarketplaceAction::Update, "acme")
        .expect("updated");
    module
        .change_marketplace(MarketplaceAction::Remove, "acme")
        .expect("removed");

    let names: Vec<String> = module
        .marketplaces()
        .expect("the list")
        .into_iter()
        .map(|known| known.name)
        .collect();
    assert_eq!(names, ["claude-plugins-official", "skills"]);
    assert!(
        module
            .installed()
            .expect("the list")
            .iter()
            .all(|plugin| plugin.marketplace != "acme")
    );
    let commands: Vec<Value> = plugin_starts(&log)
        .into_iter()
        .filter(|start| start["args"][2] != "list" && start["args"][1] != "list")
        .map(|start| start["args"].clone())
        .collect();
    assert_eq!(
        commands,
        [
            json!([
                "plugin",
                "marketplace",
                "add",
                "mattpocock/skills",
                "--json"
            ]),
            json!(["plugin", "marketplace", "update", "acme", "--json"]),
            json!(["plugin", "marketplace", "remove", "acme", "--json"]),
        ]
    );
}

#[test]
fn a_source_that_could_be_read_as_a_flag_or_holds_a_line_break_is_refused_before_anything_runs() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = marketplace_claude(&log, &json!({}));
    let module = plugins(bin.path(), playground.path(), logs.path());

    for source in [
        "",
        "   ",
        "--scope",
        "-x",
        "owner/repo\n--yes",
        "owner/repo\r",
    ] {
        assert_eq!(
            module.add_marketplace(source),
            Err(PluginError::InvalidSource),
            "{source:?} was not refused"
        );
    }
    assert_eq!(
        module.change_marketplace(MarketplaceAction::Remove, "--all"),
        Err(PluginError::InvalidSource)
    );
    assert!(plugin_starts(&log).is_empty());
}

#[test]
fn a_source_claude_code_refuses_says_its_message_and_code() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let bin = marketplace_claude(
        &log,
        &json!({ "marketplaceFailures": { "gitlab.example.com/team": true } }),
    );

    let refused = plugins(bin.path(), playground.path(), logs.path())
        .add_marketplace("gitlab.example.com/team");

    assert_eq!(
        refused,
        Err(PluginError::Failed {
            message: "Invalid marketplace source format. Try: owner/repo, https://..., or ./path"
                .into(),
            code: Some("invalid_source".into())
        })
    );
}

#[test]
fn the_marketplace_commands_need_claude_code_2_1_287() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let bin = claude_on_path(&json!({ "version": "2.1.286" }));

    assert_eq!(
        plugins(bin.path(), playground.path(), logs.path()).add_marketplace("owner/repo"),
        Err(PluginError::TooOld("2.1.286".into()))
    );
}

#[test]
fn an_update_that_declares_a_command_is_shown_and_accepting_it_updates() {
    let playground = tempfile::tempdir().expect("a folder");
    let logs = tempfile::tempdir().expect("a folder");
    let log = playground.path().join("stand-in.log");
    let installed = json!([{ "id": "deploy@acme", "version": "0.9.2", "scope": "user", "enabled": true, "installPath": "x" }]);
    let bin = claude_on_path(
        &json!({ "log": log, "plugins": { "installed": installed, "commands": { "deploy@acme": DECLARED } } }),
    );
    let module = plugins(bin.path(), playground.path(), logs.path());

    let shown = module
        .change(
            PluginAction::Update,
            "deploy@acme",
            PluginScope::User,
            None,
            None,
        )
        .expect("an answer")
        .shown_command
        .expect("the command to accept");
    assert_eq!(shown.command, DECLARED);
    assert_eq!(
        module.installed().expect("the list")[0].version.as_deref(),
        Some("0.9.2")
    );

    module
        .change(
            PluginAction::Update,
            "deploy@acme",
            PluginScope::User,
            None,
            Some(&shown.sha256),
        )
        .expect("updated");

    assert_eq!(
        module.installed().expect("the list")[0].version.as_deref(),
        Some("0.9.3")
    );
    let start = plugin_starts(&log)
        .into_iter()
        .rfind(|start| start["args"][1] == "update")
        .expect("the update");
    assert_eq!(
        start["args"],
        json!([
            "plugin",
            "update",
            "deploy@acme",
            "--scope",
            "user",
            "--accept-command",
            shown.sha256,
            "--json"
        ])
    );
    assert_eq!(
        module.change(
            PluginAction::Disable,
            "deploy@acme",
            PluginScope::User,
            None,
            Some(&shown.sha256)
        ),
        Err(PluginError::InvalidId),
        "only an install or an update accepts a command"
    );
}
