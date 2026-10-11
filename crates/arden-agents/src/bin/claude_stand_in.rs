//! A stand-in for Claude Code, for Arden Code's tests (ADR 0038). It answers `--version` and
//! `auth status`, and speaks Claude Code's protocol on its input and output with made-up replies,
//! chosen by what the message says. It never talks to Anthropic.
//!
//! Its settings are in `stand-in.json` beside it, when there is one: the `version` it says, whether
//! it is `signedIn`, the `usage` it answers `get_usage` with (ADR 0043), the `context` it answers
//! `get_context_usage` with (ADR 0044), and a `log` file where it writes how it was started (its
//! arguments and its folder) and every line it reads.
//!
//! It names a session when asked (`generate_session_title`, ADR 0050): "Named:" and the first four
//! words of what it is given.
//!
//! It answers `plugin list --json` (with `--available`, the catalog too) from `plugins` in
//! `stand-in.json`: `installed` and `available`, as Claude Code prints them, and `delayMs`, how
//! long it takes first (ADR 0053). `plugin install` adds to what it lists, kept in
//! `plugins-state.json` beside it, unless `failures` names the plugin with the `message` and
//! `failureCode` to fail with; a plugin installed already answers `already_in_goal_state`. A plugin
//! that `commands` names installs only with `--accept-command` and that command's hash; without
//! it, it shows the command (`shownCommand`), as Claude Code does. It writes `plugin-end` to its
//! log when it is done.
//!
//! It answers `plugin marketplace list --json` from `marketplaces` in `plugins`, and adds, updates
//! and removes marketplaces, kept in `marketplaces-state.json` beside it; removing one uninstalls
//! its plugins. A source named in `marketplaceFailures` fails with `invalid_source`.
//!
//! It applies the `--permission-mode` it is started with and changes it on `set_permission_mode`,
//! refusing Bypass permissions unless started with `--allow-dangerously-skip-permissions`, as
//! Claude Code does (ADR 0044). Asked "which mode", it says the mode it applies. Asked to "plan the
//! fix" in Plan mode, it asks to start a plan with `ExitPlanMode`.

use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use serde_json::{Value, json};

/// What the stand-in says and does, from `stand-in.json`.
struct Settings {
    version: String,
    signed_in: bool,
    /// The answer to `get_usage`: by default, no plan limits, as for an API key.
    usage: Value,
    /// The answer to `get_context_usage`: by default, a window of 200,000 tokens, 13% full.
    context: Value,
    log: Option<PathBuf>,
    /// What it answers `plugin` commands with (ADR 0053).
    plugins: Value,
}

fn settings() -> Settings {
    let file = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|folder| folder.join("stand-in.json")));
    let written: Value = file
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null);
    Settings {
        version: written["version"].as_str().unwrap_or("2.1.286").to_owned(),
        signed_in: written["signedIn"].as_bool().unwrap_or(true),
        usage: match &written["usage"] {
            Value::Null => {
                json!({ "subscription_type": null, "rate_limits_available": false, "rate_limits": null })
            }
            usage => usage.clone(),
        },
        context: match &written["context"] {
            Value::Null => json!({
                "categories": [
                    { "name": "System prompt", "tokens": 2_000, "kind": "used" },
                    { "name": "System tools", "tokens": 14_000, "kind": "used" },
                    { "name": "Messages", "tokens": 10_000, "kind": "used" },
                    { "name": "Autocompact buffer", "tokens": 33_000, "kind": "buffer" },
                    { "name": "Free space", "tokens": 141_000, "kind": "free" }
                ],
                "totalTokens": 26_000,
                "maxTokens": 200_000,
                "percentage": 13,
                "autoCompactThreshold": 167_000,
                "isAutoCompactEnabled": true
            }),
            context => context.clone(),
        },
        log: written["log"].as_str().map(PathBuf::from),
        plugins: written["plugins"].clone(),
    }
}

fn log(settings: &Settings, line: &str) {
    if let Some(file) = &settings.log
        && let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file)
    {
        let _ = writeln!(file, "{line}");
    }
}

fn main() {
    let settings = settings();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let folder = std::env::current_dir()
        .map(|folder| folder.display().to_string())
        .unwrap_or_default();
    log(
        &settings,
        &format!("start {}", json!({ "args": args, "folder": folder })),
    );
    if args.iter().any(|arg| arg == "--version") {
        println!("{} (Claude Code)", settings.version);
        return;
    }
    if args.first().map(String::as_str) == Some("plugin") {
        plugin(&settings, &args[1..]);
        log(&settings, "plugin-end");
        return;
    }
    if args.first().map(String::as_str) == Some("auth") {
        let method = if settings.signed_in {
            "claude.ai"
        } else {
            "none"
        };
        println!(
            "{}",
            json!({ "loggedIn": settings.signed_in, "authMethod": method, "apiProvider": "firstParty" })
        );
        return;
    }
    let session = args
        .iter()
        .position(|arg| arg == "--session-id" || arg == "--resume")
        .and_then(|at| args.get(at + 1))
        .cloned()
        .unwrap_or_else(|| "stand-in".to_owned());
    let mode = args
        .iter()
        .position(|arg| arg == "--permission-mode")
        .and_then(|at| args.get(at + 1))
        .cloned()
        .unwrap_or_else(|| "default".to_owned());
    let bypass_launched = args
        .iter()
        .any(|arg| arg == "--allow-dangerously-skip-permissions");
    Conversation::new(settings, session, mode, bypass_launched).run();
}

/// Answers a `claude plugin` command as Claude Code does with `--json` (ADR 0053).
fn plugin(settings: &Settings, args: &[String]) {
    let plugins = &settings.plugins;
    if let Some(delay) = plugins["delayMs"].as_u64() {
        thread::sleep(Duration::from_millis(delay));
    }
    let installed = installed_plugins(plugins);
    match args.first().map(String::as_str) {
        Some("install") => install(plugins, args, installed),
        Some("marketplace") => marketplace(plugins, &args[1..], installed),
        Some(command @ ("enable" | "disable" | "update" | "uninstall")) => {
            alter(command, args, installed);
        }
        Some("list") if args.iter().any(|arg| arg == "--available") => {
            let available = match &plugins["available"] {
                Value::Null => json!([]),
                available => available.clone(),
            };
            let answer = json!({ "installed": installed, "available": available });
            println!(
                "{}",
                serde_json::to_string_pretty(&answer).unwrap_or_default()
            );
        }
        Some("list") => {
            println!(
                "{}",
                serde_json::to_string_pretty(&installed).unwrap_or_default()
            );
        }
        _ => {
            eprintln!("error: unknown plugin command");
            std::process::exit(1);
        }
    }
}

/// A stand-in for the `sha256` Claude Code gives a declared command: 64 hex digits that change
/// with the command.
fn hash_of(command: &str) -> String {
    use std::hash::{DefaultHasher, Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    command.hash(&mut hasher);
    format!("{:016x}", hasher.finish()).repeat(4)
}

/// Where the stand-in keeps the marketplaces it has added, between runs.
fn marketplaces_state() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|exe| {
        exe.parent()
            .map(|folder| folder.join("marketplaces-state.json"))
    })
}

/// The marketplaces it lists: those it changed itself, else those of its settings.
fn known_marketplaces(plugins: &Value) -> Value {
    marketplaces_state()
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| match &plugins["marketplaces"] {
            Value::Null => json!([]),
            known => known.clone(),
        })
}

fn save_marketplaces(known: &Value) {
    if let Some(file) = marketplaces_state() {
        let _ = std::fs::write(file, known.to_string());
    }
}

/// Prints a marketplace command's result, as Claude Code does with `--json`, and fails with it
/// when it failed.
fn marketplace_result(command: &str, name: &str, outcome: &str, message: &str, code: Option<&str>) {
    println!(
        "{}",
        json!({ "command": command, "outcome": outcome, "marketplace": name, "message": message, "failureCode": code })
    );
    if outcome != "ok" {
        std::process::exit(1);
    }
}

/// The name a marketplace added from `source` takes: the last part of its path.
fn marketplace_name(source: &str) -> String {
    source
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(source)
        .trim_end_matches(".git")
        .trim_end_matches(".json")
        .to_owned()
}

/// `plugin marketplace list|add|update|remove … --json`.
fn marketplace(plugins: &Value, args: &[String], mut installed: Value) {
    let mut known = known_marketplaces(plugins);
    let target = args.get(1).map_or("", String::as_str);
    let listed = known
        .as_array()
        .is_some_and(|list| list.iter().any(|known| known["name"] == target));
    match args.first().map(String::as_str) {
        Some("list") => println!(
            "{}",
            serde_json::to_string_pretty(&known).unwrap_or_default()
        ),
        Some("add") if !plugins["marketplaceFailures"][target].is_null() => {
            let message =
                "Invalid marketplace source format. Try: owner/repo, https://..., or ./path";
            marketplace_result(
                "marketplace-add",
                "",
                "failed",
                message,
                Some("invalid_source"),
            );
        }
        Some("add") => {
            let name = marketplace_name(target);
            if let Some(list) = known.as_array_mut() {
                list.push(json!({ "name": name, "source": "github", "repo": target, "installLocation": "x" }));
            }
            save_marketplaces(&known);
            let message = format!("Successfully added marketplace: {name}");
            marketplace_result("marketplace-add", &name, "ok", &message, None);
        }
        Some("update") if listed => {
            let message = format!("Successfully updated marketplace: {target}");
            marketplace_result("marketplace-update", target, "ok", &message, None);
        }
        Some("remove") if listed => {
            if let Some(list) = known.as_array_mut() {
                list.retain(|known| known["name"] != target);
            }
            save_marketplaces(&known);
            let suffix = format!("@{target}");
            if let Some(plugins) = installed.as_array_mut() {
                plugins.retain(|plugin| {
                    !plugin["id"]
                        .as_str()
                        .is_some_and(|id| id.ends_with(&suffix))
                });
            }
            save_installed(&installed);
            let message = format!("Successfully removed marketplace: {target}");
            marketplace_result("marketplace-remove", target, "ok", &message, None);
        }
        Some(command) => {
            let message = format!("Marketplace '{target}' not found");
            marketplace_result(
                &format!("marketplace-{command}"),
                target,
                "failed",
                &message,
                Some("not_found"),
            );
        }
        None => std::process::exit(1),
    }
}

/// Where the stand-in keeps the plugins it has installed, between runs.
fn plugins_state() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|folder| folder.join("plugins-state.json")))
}

/// The plugins it lists as installed: those it installed itself, else those of its settings.
fn installed_plugins(plugins: &Value) -> Value {
    plugins_state()
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| match &plugins["installed"] {
            Value::Null => json!([]),
            installed => installed.clone(),
        })
}

fn save_installed(installed: &Value) {
    if let Some(file) = plugins_state() {
        let _ = std::fs::write(file, installed.to_string());
    }
}

/// The value after a flag, such as the scope after `--scope`.
fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|arg| arg == name)
        .and_then(|at| args.get(at + 1))
        .map(String::as_str)
}

/// Prints a command's result on its last line, as Claude Code does with `--json`, and fails with
/// it when it failed.
fn result(command: &str, id: &str, outcome: &str, message: &str, extra: &Value) {
    let mut answer =
        json!({ "command": command, "outcome": outcome, "message": message, "pluginId": id });
    if let (Some(answer), Some(extra)) = (answer.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            answer.insert(key.clone(), value.clone());
        }
    }
    println!("Working on {id}…");
    println!("{answer}");
    if outcome != "ok" {
        std::process::exit(1);
    }
}

/// `plugin install <id> --scope <scope> --json`.
fn install(plugins: &Value, args: &[String], mut installed: Value) {
    let id = args.get(1).map_or("", String::as_str);
    let scope = flag(args, "--scope").unwrap_or("user");
    let failure = &plugins["failures"][id];
    if !failure.is_null() {
        let message = failure["message"].as_str().unwrap_or("It failed");
        result(
            "install",
            id,
            "failed",
            message,
            &json!({ "failureCode": failure["failureCode"] }),
        );
        return;
    }
    if let Some(command) = plugins["commands"][id].as_str() {
        let sha256 = hash_of(command);
        let accepted = flag(args, "--accept-command");
        if accepted != Some(sha256.as_str()) {
            println!("{command}");
            let shown = json!({
                "command": command, "pluginId": id, "sha256": sha256,
                "acceptCommandMatched": accepted.map(|_| false)
            });
            let message =
                format!("Plugin '{id}' declares a command; review it and accept it to install");
            result(
                "install",
                id,
                "failed",
                &message,
                &json!({ "failureCode": "command_not_accepted", "shownCommand": shown }),
            );
            return;
        }
    }
    let folder = std::env::current_dir()
        .map(|folder| folder.display().to_string())
        .unwrap_or_default();
    let project = (scope != "user").then_some(folder);
    let already = installed.as_array().is_some_and(|list| {
        list.iter().any(|plugin| {
            plugin["id"] == id
                && plugin["scope"] == scope
                && plugin["projectPath"].as_str() == project.as_deref()
        })
    });
    if already {
        let message = format!("Plugin '{id}' is already installed");
        result(
            "install",
            id,
            "failed",
            &message,
            &json!({ "failureCode": "already_in_goal_state", "scope": scope }),
        );
        return;
    }
    let version = plugins["available"]
        .as_array()
        .and_then(|list| list.iter().find(|plugin| plugin["pluginId"] == id))
        .map_or(json!("1.0.0"), |plugin| plugin["version"].clone());
    if let Some(list) = installed.as_array_mut() {
        list.push(json!({
            "id": id, "version": version, "scope": scope, "enabled": true,
            "installPath": format!("C:\\stand-in\\cache\\{id}"), "projectPath": project
        }));
    }
    save_installed(&installed);
    let message = format!("Successfully installed plugin: {id} (scope: {scope})");
    result("install", id, "ok", &message, &json!({ "scope": scope }));
}

/// `plugin enable|disable|update|uninstall <id> [--scope <scope>] --json`, on the plugin listed at
/// that scope (and, for a project's, in this folder), or the first with that id without one.
fn alter(command: &str, args: &[String], mut installed: Value) {
    let id = args.get(1).map_or("", String::as_str);
    let scope = flag(args, "--scope");
    let folder = std::env::current_dir()
        .map(|folder| folder.display().to_string())
        .unwrap_or_default();
    let Some(list) = installed.as_array_mut() else {
        return;
    };
    let at = list.iter().position(|plugin| {
        plugin["id"] == id
            && scope.is_none_or(|scope| {
                plugin["scope"] == scope
                    && (scope == "user"
                        || plugin["projectPath"].as_str().is_some_and(|path| {
                            std::fs::canonicalize(path).ok() == std::fs::canonicalize(&folder).ok()
                        }))
            })
    });
    let Some(at) = at else {
        let message = format!("Plugin '{id}' is not installed in this scope");
        result(
            command,
            id,
            "failed",
            &message,
            &json!({ "failureCode": "not_installed" }),
        );
        return;
    };
    let message = match command {
        "enable" | "disable" => {
            let on = command == "enable";
            if list[at]["enabled"] == on {
                let message = format!("Plugin '{id}' is already {command}d");
                result(
                    command,
                    id,
                    "failed",
                    &message,
                    &json!({ "failureCode": "already_in_goal_state" }),
                );
                return;
            }
            list[at]["enabled"] = json!(on);
            format!("Successfully {command}d plugin: {id}")
        }
        "update" => {
            let version = list[at]["version"].as_str().unwrap_or("1.0.0").to_owned();
            let (base, patch) = version.rsplit_once('.').unwrap_or(("1.0", "0"));
            let next = format!("{base}.{}", patch.parse::<u32>().unwrap_or(0) + 1);
            list[at]["version"] = json!(next);
            format!("Plugin '{id}' updated from {version} to {next}")
        }
        _ => {
            list.remove(at);
            format!("Successfully uninstalled plugin: {id}")
        }
    };
    save_installed(&installed);
    result(command, id, "ok", &message, &json!({}));
}

/// Writes a frame on the stand-in's output.
fn send(frame: &Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{frame}");
    let _ = out.flush();
}

/// Answers a request of Arden Code's.
fn respond(request: &Value, response: &Value) {
    send(&json!({
        "type": "control_response",
        "response": { "subtype": "success", "request_id": request["request_id"], "response": response }
    }));
}

/// Refuses a request of Arden Code's, as Claude Code does.
fn refuse(request: &Value, error: &str) {
    send(&json!({
        "type": "control_response",
        "response": { "subtype": "error", "request_id": request["request_id"], "error": error }
    }));
}

/// What the stand-in says it can do, in its answer to `initialize`: a few slash commands and two
/// models, as Claude Code lists them (ADR 0042).
fn listing() -> Value {
    json!({
        "commands": [
            { "name": "compact", "description": "Free up context by summarizing the conversation so far", "argumentHint": "<optional custom summarization instructions>", "builtin": true },
            { "name": "context", "description": "Show current context usage", "argumentHint": "", "builtin": true },
            { "name": "stand-in-skill:greet", "description": "(stand-in-skill) Greets the person.", "argumentHint": "", "aliases": ["greet"] }
        ],
        "models": [
            { "value": "default", "displayName": "Default (recommended)", "description": "The stand-in's own model", "supportsEffort": true, "supportedEffortLevels": ["low", "medium", "high"] },
            { "value": "stand-in-large", "displayName": "Stand-in Large", "description": "The larger stand-in", "supportsEffort": true, "supportedEffortLevels": ["low", "medium", "high"] },
            { "value": "stand-in-small", "displayName": "Stand-in Small", "description": "The smaller stand-in" },
            { "value": "claude-stand-in-1", "displayName": "Stand-in 1", "description": "An older stand-in", "supportsEffort": true, "supportedEffortLevels": ["low"] }
        ]
    })
}

/// A conversation over the stand-in's input and output.
struct Conversation {
    settings: Settings,
    session: String,
    lines: Receiver<String>,
    messages: u32,
    /// The permission mode it applies, by Claude Code's name (ADR 0044).
    mode: String,
    /// Whether it was started so that Bypass permissions can be turned on.
    bypass_launched: bool,
}

impl Conversation {
    fn new(settings: Settings, session: String, mode: String, bypass_launched: bool) -> Self {
        let (sender, lines) = mpsc::channel();
        thread::spawn(move || {
            for line in io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        Self {
            settings,
            session,
            lines,
            messages: 0,
            mode,
            bypass_launched,
        }
    }

    /// Changes the permission mode as Claude Code does: Bypass permissions only when it was started
    /// so that it can be, and a report of the mode after the change.
    fn set_permission_mode(&mut self, request: &Value) {
        let mode = request["request"]["mode"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        if mode == "bypassPermissions" && !self.bypass_launched {
            refuse(
                request,
                "Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions",
            );
            return;
        }
        respond(request, &json!({ "mode": mode }));
        self.mode = mode;
        send(&json!({
            "type": "system", "subtype": "status", "status": null,
            "permissionMode": self.mode, "session_id": self.session
        }));
    }

    /// The next frame Arden Code writes, or nothing when it has gone.
    fn next(&self) -> Option<Value> {
        let line = self.lines.recv().ok()?;
        log(&self.settings, &format!("read {line}"));
        Some(serde_json::from_str(&line).unwrap_or(Value::Null))
    }

    fn run(&mut self) {
        while let Some(frame) = self.next() {
            match frame["type"].as_str() {
                Some("control_request") if frame["request"]["subtype"] == "initialize" => {
                    let mut answer = listing();
                    answer["current_permission_mode"] = json!(self.mode);
                    respond(&frame, &answer);
                }
                Some("control_request") if frame["request"]["subtype"] == "get_usage" => {
                    respond(&frame, &self.settings.usage);
                }
                Some("control_request") if frame["request"]["subtype"] == "get_context_usage" => {
                    respond(&frame, &self.settings.context);
                }
                Some("control_request") if frame["request"]["subtype"] == "set_permission_mode" => {
                    self.set_permission_mode(&frame);
                }
                // A name for the session (ADR 0050): "Named:" and the first four words asked.
                Some("control_request")
                    if frame["request"]["subtype"] == "generate_session_title" =>
                {
                    let words: Vec<&str> = frame["request"]["description"]
                        .as_str()
                        .unwrap_or_default()
                        .split_whitespace()
                        .take(4)
                        .collect();
                    respond(
                        &frame,
                        &json!({ "title": format!("Named: {}", words.join(" ")) }),
                    );
                }
                Some("control_request") => respond(&frame, &json!({})),
                Some("user") => {
                    let text = frame["message"]["content"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned();
                    self.answer(&text);
                }
                _ => {}
            }
        }
        // Arden Code closed the input: the conversation is over.
        // A Claude Code started only to list what it can do keeps no conversation.
        let listing = std::env::args().any(|argument| argument == "--no-session-persistence");
        log(&self.settings, if listing { "end listing" } else { "end" });
    }

    fn stream(&self, event: &Value) {
        send(
            &json!({ "type": "stream_event", "event": event, "parent_tool_use_id": null, "session_id": self.session }),
        );
    }

    fn assistant(&self, message: &str, content: &Value) {
        send(&json!({
            "type": "assistant",
            "message": { "id": message, "role": "assistant", "content": content },
            "parent_tool_use_id": null,
            "session_id": self.session
        }));
    }

    fn result(&self, text: &str, is_error: bool) {
        send(
            &json!({ "type": "result", "subtype": "success", "is_error": is_error, "result": text, "session_id": self.session }),
        );
    }

    /// Streams a text block, a few words at a time.
    fn say(&mut self, text: &str) {
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.stream(&json!({ "type": "message_start", "message": { "id": message } }));
        self.stream(&json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "text", "text": "" } }));
        for piece in text.split_inclusive(' ') {
            self.stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": piece } }));
        }
        self.assistant(&message, &json!([{ "type": "text", "text": text }]));
    }

    /// Uses a tool, and answers with what it gave.
    fn tool(&mut self, id: &str, name: &str, input: &Value, output: &str, outcome: Option<&Value>) {
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.assistant(
            &message,
            &json!([{ "type": "tool_use", "id": id, "name": name, "input": input }]),
        );
        let mut frame = json!({
            "type": "user",
            "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": id, "content": output }] },
            "parent_tool_use_id": null,
            "session_id": self.session
        });
        if let Some(outcome) = outcome {
            frame["tool_use_result"] = outcome.clone();
        }
        send(&frame);
    }

    /// Asks permission to use a tool, and waits for the answer. A stop interrupts it.
    fn ask(&self, request: &str, tool: &str, input: &Value, suggestions: &Value) -> Option<Value> {
        send(&json!({
            "type": "control_request",
            "request_id": request,
            "request": { "subtype": "can_use_tool", "tool_name": tool, "input": input, "tool_use_id": format!("toolu_{request}"), "permission_suggestions": suggestions }
        }));
        loop {
            let frame = self.next()?;
            if frame["type"] == "control_response" && frame["response"]["request_id"] == request {
                return Some(frame["response"]["response"].clone());
            }
            if frame["type"] == "control_request" {
                respond(&frame, &json!({}));
                if frame["request"]["subtype"] == "interrupt" {
                    return None;
                }
            }
        }
    }

    fn answer(&mut self, text: &str) {
        send(
            &json!({ "type": "system", "subtype": "init", "session_id": self.session, "claude_code_version": self.settings.version }),
        );
        if !self.settings.signed_in {
            self.messages += 1;
            send(&json!({
                "type": "assistant",
                "message": { "id": format!("msg_{}", self.messages), "role": "assistant", "content": [{ "type": "text", "text": "Not logged in · Please run /login" }] },
                "error": "authentication_failed",
                "parent_tool_use_id": null,
                "session_id": self.session
            }));
            self.result("Not logged in · Please run /login", true);
            return;
        }
        let asked = text.to_lowercase();
        if asked.contains("crash") {
            self.say("Starting");
            std::process::exit(3);
        } else if asked.contains("slow") {
            self.slowly();
        } else if asked.contains("ask me") {
            self.ask_questions();
        } else if asked.contains("run the tests") {
            self.run_tests();
        } else if asked.contains("plan the fix") && self.mode == "plan" {
            self.plan();
        } else if asked.contains("which mode") {
            let said = format!("The permission mode is {}.", self.mode);
            self.say(&said);
            self.result(&said, false);
        } else if asked.contains("read the readme") {
            self.tool(
                "toolu_read",
                "Read",
                &json!({ "file_path": "README.md" }),
                "# Demo",
                None,
            );
            self.say("It is a demo.");
            self.result("It is a demo.", false);
        } else {
            self.say(&format!("You said: {text}"));
            self.result(&format!("You said: {text}"), false);
        }
    }

    /// Writes a word every tenth of a second for a minute, until it is interrupted.
    fn slowly(&mut self) {
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.stream(&json!({ "type": "message_start", "message": { "id": message } }));
        self.stream(&json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "text", "text": "" } }));
        for _ in 0..600 {
            if let Ok(line) = self.lines.recv_timeout(Duration::from_millis(100)) {
                log(&self.settings, &format!("read {line}"));
                let frame: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                if frame["type"] == "control_request" {
                    respond(&frame, &json!({ "still_queued": [] }));
                    if frame["request"]["subtype"] == "interrupt" {
                        send(
                            &json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "", "session_id": self.session }),
                        );
                        return;
                    }
                }
            }
            self.stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "word " } }));
        }
        self.result("", false);
    }

    /// Asks to run the tests, and runs them when allowed.
    fn run_tests(&mut self) {
        let input = json!({ "command": "npm test", "description": "Run the tests" });
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.assistant(
            &message,
            &json!([{ "type": "tool_use", "id": "toolu_r1", "name": "Bash", "input": input }]),
        );
        let rule = json!([{ "type": "addRules", "rules": [{ "toolName": "Bash", "ruleContent": "npm test:*" }], "behavior": "allow", "destination": "localSettings" }]);
        let Some(answer) = self.ask("r1", "Bash", &input, &rule) else {
            send(
                &json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "", "session_id": self.session }),
            );
            return;
        };
        let allowed = answer["behavior"] == "allow";
        let output = if allowed {
            "All 12 tests passed."
        } else {
            "The person denied this."
        };
        send(&json!({
            "type": "user",
            "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_r1", "content": output, "is_error": !allowed }] },
            "parent_tool_use_id": null,
            "session_id": self.session
        }));
        if !allowed && answer["interrupt"] == true {
            send(
                &json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "", "session_id": self.session }),
            );
            return;
        }
        let said = if allowed {
            "The tests passed."
        } else {
            "I did not run them."
        };
        self.say(said);
        self.result(said, false);
    }

    /// Asks to start a plan, and starts it in the mode the person chose, or keeps planning.
    fn plan(&mut self) {
        let input = json!({ "plan": "## The fix\n\n1. Read the build script\n2. Fix the path" });
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.assistant(
            &message,
            &json!([{ "type": "tool_use", "id": "toolu_p1", "name": "ExitPlanMode", "input": input }]),
        );
        let Some(answer) = self.ask("p1", "ExitPlanMode", &input, &json!([])) else {
            send(
                &json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "", "session_id": self.session }),
            );
            return;
        };
        let said = if answer["behavior"] == "allow" {
            if let Some(mode) = answer["updatedPermissions"][0]["mode"].as_str() {
                mode.clone_into(&mut self.mode);
                send(&json!({
                    "type": "system", "subtype": "status", "status": null,
                    "permissionMode": self.mode, "session_id": self.session
                }));
            }
            format!("Started the plan in {}.", self.mode)
        } else {
            format!(
                "I will keep planning. {}",
                answer["message"].as_str().unwrap_or_default()
            )
        };
        self.say(&said);
        self.result(&said, false);
    }

    /// Asks which library to use, and says what the person chose.
    fn ask_questions(&mut self) {
        let input = json!({ "questions": [{
            "question": "Which library should the app use?",
            "header": "Library",
            "options": [
                { "label": "React", "description": "The one the app already uses" },
                { "label": "Vue", "description": "A lighter choice" }
            ],
            "multiSelect": false
        }] });
        self.messages += 1;
        let message = format!("msg_{}", self.messages);
        self.assistant(
            &message,
            &json!([{ "type": "tool_use", "id": "toolu_q1", "name": "AskUserQuestion", "input": input }]),
        );
        let Some(answer) = self.ask("q1", "AskUserQuestion", &input, &json!([])) else {
            send(
                &json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "", "session_id": self.session }),
            );
            return;
        };
        let chosen = answer["updatedInput"]["answers"]["Which library should the app use?"]
            .as_str()
            .unwrap_or("nothing")
            .to_owned();
        send(&json!({
            "type": "user",
            "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_q1", "content": format!("The person chose {chosen}."), "is_error": false }] },
            "parent_tool_use_id": null,
            "session_id": self.session
        }));
        let said = format!("You chose {chosen}.");
        self.say(&said);
        self.result(&said, false);
    }
}
