//! A stand-in for Claude Code, for Arden Code's tests (ADR 0038). It answers `--version` and
//! `auth status`, and speaks Claude Code's protocol on its input and output with made-up replies,
//! chosen by what the message says. It never talks to Anthropic.
//!
//! Its settings are in `stand-in.json` beside it, when there is one: the `version` it says, whether
//! it is `signedIn`, the `usage` it answers `get_usage` with (ADR 0043), the `context` it answers
//! `get_context_usage` with (ADR 0044), and a `log` file where it writes how it was started (its
//! arguments and its folder) and every line it reads.
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
