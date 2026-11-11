//! A deterministic Codex app-server stand-in for tests. It never contacts `OpenAI` or reads credentials.
//! Test settings live beside this executable in `stand-in.json`, never in the person's Codex home.

use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::{Value, json};

fn settings() -> Value {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|folder| folder.join("stand-in.json")))
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null)
}

fn log(settings: &Value, value: &Value) {
    if let Some(path) = settings["log"].as_str()
        && let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
    {
        let mut frame = value.to_string();
        frame.push('\n');
        let _ = file.write_all(frame.as_bytes());
    }
}

fn reply(id: &Value, result: Value) {
    let mut frame = json!({"id": id});
    frame["result"] = result;
    send(&frame);
}

fn send(frame: &Value) {
    println!("{frame}");
    let _ = io::stdout().flush();
}

fn thread_response(settings: &Value, id: &str, path: Option<&std::path::Path>) -> Value {
    json!({"thread": {"id": id, "path": path},
        "approvalPolicy": "never", "approvalsReviewer": "user", "cwd": std::env::current_dir().ok(),
        "sandbox": {"type": if settings["unsafePolicy"] == true {"dangerFullAccess"} else {"readOnly"}, "networkAccess": false}})
}

fn rollout(history: &std::path::Path, id: &str) -> Option<PathBuf> {
    uuid::Uuid::parse_str(id).ok()?;
    Some(history.join(format!("{id}.json")))
}

#[derive(Clone)]
struct Running {
    thread: String,
    turn: String,
    stopped: Arc<AtomicBool>,
}

fn stream(settings: &Value, running: &Running, prompt: &str) {
    let item = uuid::Uuid::new_v4().to_string();
    if let Some(method) = settings["request"].as_str() {
        send(&json!({"id": "authority-1", "method": method,
            "params": {"threadId": running.thread, "turnId": running.turn, "itemId": item}}));
        while !running.stopped.load(Ordering::Acquire) {
            std::thread::sleep(Duration::from_millis(5));
        }
        return;
    }
    if settings["foreignEvents"] == true {
        send(&json!({"method": "item/agentMessage/delta", "params": {
            "threadId": "another-thread", "turnId": running.turn, "itemId": item, "delta": "FOREIGN OUTPUT"}}));
        send(&json!({"method": "item/agentMessage/delta", "params": {
            "threadId": running.thread, "turnId": "another-turn", "itemId": item, "delta": "FOREIGN OUTPUT"}}));
    }
    if settings["thinking"] == true {
        let reasoning = uuid::Uuid::new_v4().to_string();
        send(
            &json!({"method": "item/reasoning/summaryTextDelta", "params": {
            "threadId": running.thread, "turnId": running.turn, "itemId": reasoning, "delta": "A published reasoning summary."}}),
        );
    }
    for text in ["You said: ", prompt] {
        send(&json!({"method": "item/agentMessage/delta", "params": {
            "threadId": running.thread, "turnId": running.turn, "itemId": item, "delta": text}}));
        if settings["hang"] == true {
            break;
        }
    }
    if settings["hang"] == true {
        while !running.stopped.load(Ordering::Acquire) {
            std::thread::sleep(Duration::from_millis(5));
        }
        send(&json!({"method": "item/agentMessage/delta", "params": {
            "threadId": running.thread, "turnId": running.turn, "itemId": item, "delta": "MUST NOT APPEAR"}}));
    } else {
        send(
            &json!({"method": "item/completed", "params": {"threadId": running.thread, "turnId": running.turn,
            "item": {"type": "agentMessage", "id": item, "text": format!("You said: {prompt}")}}}),
        );
    }
    let status = if running.stopped.load(Ordering::Acquire) {
        "interrupted"
    } else if settings["turnFailed"] == true {
        "failed"
    } else {
        "completed"
    };
    send(
        &json!({"method": "turn/completed", "params": {"threadId": running.thread,
        "turn": {"id": running.turn, "status": status, "items": [], "error": null}}}),
    );
}

fn begin_turn(settings: &Value, history: &std::path::Path, thread: &str, frame: &Value) -> Running {
    let prompt = frame["params"]["input"][0]["text"]
        .as_str()
        .unwrap_or_default();
    if settings["noRollout"] != true {
        std::fs::create_dir_all(history).expect("fixture history");
        std::fs::write(
            rollout(history, thread).expect("fixture id"),
            json!({"prompt": prompt}).to_string(),
        )
        .expect("fixture rollout");
    }
    let turn = uuid::Uuid::new_v4().to_string();
    if settings["descendant"] == true {
        let mut child =
            std::process::Command::new(std::env::current_exe().expect("fixture executable"))
                .arg("--hold-inherited-pipes")
                .spawn()
                .expect("a descendant with inherited pipes");
        log(settings, &json!({"spawnedDescendant": child.id()}));
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
    reply(
        &frame["id"],
        json!({"turn": {"id": turn, "status": "inProgress", "items": [], "error": null}}),
    );
    let running = Running {
        thread: thread.to_owned(),
        turn,
        stopped: Arc::new(AtomicBool::new(false)),
    };
    log(
        settings,
        &json!({"active": {"threadId": thread, "turnId": running.turn}}),
    );
    let active = running.clone();
    let config = settings.clone();
    let prompt = prompt.to_owned();
    std::thread::spawn(move || stream(&config, &running, &prompt));
    active
}

fn main() {
    let settings = settings();
    let args: Vec<String> = std::env::args().skip(1).collect();
    log(
        &settings,
        &json!({"start": {"args": args, "folder": std::env::current_dir().ok()}}),
    );
    if args.first().is_some_and(|arg| arg == "--version") {
        println!(
            "codex-cli {}",
            settings["version"].as_str().unwrap_or("0.167.1")
        );
        return;
    }
    let history = settings["history"].as_str().map_or_else(
        || {
            std::env::current_exe()
                .expect("fixture executable")
                .parent()
                .expect("its folder")
                .join("history")
        },
        PathBuf::from,
    );
    let _lease = (settings["holdPort"] == true).then(|| {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("a fixture resource");
        log(
            &settings,
            &json!({"heldPort": listener.local_addr().expect("an address").port()}),
        );
        listener
    });
    if args
        .first()
        .is_some_and(|arg| arg == "--hold-inherited-pipes")
    {
        std::thread::sleep(Duration::from_secs(4));
        return;
    }
    if settings["malformed"] == true {
        println!("not a JSON frame");
        return;
    }
    serve(&settings, &history);
}

fn serve(settings: &Value, history: &std::path::Path) {
    let mut thread = String::new();
    let mut active: Option<Running> = None;
    for line in io::stdin().lock().lines().map_while(Result::ok) {
        let Ok(frame) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        log(settings, &frame);
        let id = &frame["id"];
        match frame["method"].as_str() {
            Some("initialize") => {
                if settings["compatible"] == false {
                    println!(
                        "{}",
                        json!({"id": id, "error": {"code": -32601, "message": "Not supported by this stand-in"}})
                    );
                } else {
                    reply(
                        id,
                        json!({"userAgent": "codex-stand-in/0.167.1", "platformOs": std::env::consts::OS,
                        "platformFamily": std::env::consts::FAMILY, "codexHome": PathBuf::from("fixture-codex-home")}),
                    );
                }
            }
            Some("initialized") => {}
            Some("account/read") => {
                if settings["unknownAccount"] == true {
                    reply(id, json!({}));
                    continue;
                }
                let account = if settings["signedIn"] == false {
                    Value::Null
                } else {
                    json!({"type": "chatgpt", "email": "private-account-field@example.invalid", "planType": "plus"})
                };
                reply(id, json!({"account": account, "requiresOpenaiAuth": true}));
            }
            Some("thread/start") => {
                thread = uuid::Uuid::new_v4().to_string();
                reply(id, thread_response(settings, &thread, None));
            }
            Some("thread/resume") => {
                let candidate = frame["params"]["threadId"].as_str().unwrap_or_default();
                if let Some(path) = rollout(history, candidate).filter(|path| path.is_file())
                    && settings["missingRollout"] != true
                {
                    candidate.clone_into(&mut thread);
                    reply(id, thread_response(settings, &thread, Some(&path)));
                } else {
                    send(
                        &json!({"id": id, "error": {"code": -32600, "message": "No fixture rollout"}}),
                    );
                }
            }
            Some("turn/start") => {
                active = Some(begin_turn(settings, history, &thread, &frame));
            }
            Some("turn/interrupt") => {
                if let Some(running) = &active
                    && frame["params"]["threadId"] == running.thread
                    && frame["params"]["turnId"] == running.turn
                {
                    running.stopped.store(true, Ordering::Release);
                }
                reply(id, json!({}));
            }
            _ if !id.is_null() => {
                println!(
                    "{}",
                    json!({"id": id, "error": {"code": -32601, "message": "Unknown stand-in method"}})
                );
            }
            _ => {}
        }
        let _ = io::stdout().flush();
    }
}
