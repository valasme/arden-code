//! A native, explicitly read-only Codex session. Each turn owns its supervised server process.

use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use arden_core::error::ErrorCode;
use arden_process::command::Arg;
use arden_process::resolve::Lookup;
use arden_process::supervisor::Supervisor;
use serde_json::{Value, json};

use super::locate;
use super::rpc::{Client, Error, PATIENCE};
use crate::driver::{AgentDriver, Control, Flow, ReplyRequest};
use crate::model::{Item, StatusKind, TurnEvent};

// Native noninteractive pacing, not an approval grant: commands remain in the confirmed read-only,
// network-disabled sandbox. Requests for authority outside it are still refused below.
const READ_ONLY_APPROVALS: &str = "never";

/// Codex keeps credentials and rollouts; Arden keeps only the confirmed opaque conversation id.
pub struct CodexDriver {
    supervisor: Option<Arc<Supervisor>>,
    search_path: Option<OsString>,
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// A native turn's ids never travel independently from the client that owns them.
struct ActiveTurn {
    client: Client,
    thread_id: String,
    turn_id: String,
}

impl CodexDriver {
    #[must_use]
    pub fn new(supervisor: Option<Arc<Supervisor>>) -> Self {
        Self {
            supervisor,
            search_path: None,
            active: Mutex::new(HashMap::new()),
        }
    }

    #[must_use]
    pub fn with_search_path(supervisor: Arc<Supervisor>, search_path: OsString) -> Self {
        Self {
            search_path: Some(search_path),
            ..Self::new(Some(supervisor))
        }
    }

    fn begin(
        &self,
        request: &ReplyRequest<'_>,
        cancelled: &dyn Fn() -> bool,
    ) -> Result<ActiveTurn, ErrorCode> {
        if request.conversation.is_none() && request.has_reply_history {
            return Err(ErrorCode::CodexConversationMissing);
        }
        let supervisor = self
            .supervisor
            .as_ref()
            .ok_or(ErrorCode::ProcessSupervisor)?;
        let located = match &self.search_path {
            Some(path) => locate::find(path, &Lookup::of_this_platform()),
            None => locate::from_environment(),
        }
        .map_err(|missing| match missing {
            locate::Missing::NotInstalled => ErrorCode::CodexNotInstalled,
            locate::Missing::NativeProgram => ErrorCode::CodexNpmWrapper,
        })?;
        let version = supervisor
            .run_private(
                "codex-version",
                &located.program,
                &[Arg::Literal("--version")],
                Duration::from_secs(10),
            )
            .ok()
            .filter(|done| !done.timed_out && done.exit_code == Some(0))
            .and_then(|done| crate::detect::parse_version(&done.output))
            .ok_or(ErrorCode::CodexNotUnderstood)?;
        if located
            .package_version
            .as_ref()
            .is_some_and(|expected| expected != &version)
        {
            return Err(ErrorCode::CodexNotUnderstood);
        }
        let mut client =
            Client::launch(supervisor, &located.program, request.folder).map_err(code)?;
        client.initialize(cancelled).map_err(code)?;
        if client.signed_in(cancelled).map_err(code)? == Some(false) {
            return Err(ErrorCode::CodexSignedOut);
        }
        let mut parameters = policy(request.folder);
        let method = if let Some(id) = request.conversation {
            parameters["threadId"] = json!(id);
            parameters["excludeTurns"] = json!(true);
            "thread/resume"
        } else {
            parameters["ephemeral"] = json!(false);
            "thread/start"
        };
        let started = client
            .call(method, parameters, cancelled, PATIENCE)
            .map_err(|error| {
                if method == "thread/resume" && error == Error::Remote {
                    ErrorCode::CodexConversationMissing
                } else {
                    code(error)
                }
            })?;
        check_policy(&started, request.folder)?;
        let thread_id = opaque(&started["thread"]["id"])?;
        if request
            .conversation
            .is_some_and(|expected| expected != thread_id)
        {
            return Err(ErrorCode::CodexConversationMissing);
        }
        let accepted = client
            .call(
                "turn/start",
                json!({
                    "threadId": thread_id,
                    "input": [{"type": "text", "text": request.prompt, "text_elements": []}],
                    "approvalPolicy": READ_ONLY_APPROVALS, "approvalsReviewer": "user",
                    "sandboxPolicy": {"type": "readOnly", "networkAccess": false},
                    "cwd": request.folder
                }),
                cancelled,
                PATIENCE,
            )
            .map_err(code)?;
        let turn_id = opaque(&accepted["turn"]["id"])?;
        Ok(ActiveTurn {
            client,
            thread_id,
            turn_id,
        })
    }

    fn run(
        &self,
        request: &ReplyRequest<'_>,
        cancelled: &dyn Fn() -> bool,
        emit: &mut dyn FnMut(TurnEvent) -> Flow,
    ) -> Result<(), ErrorCode> {
        let mut active = self.begin(request, cancelled)?;
        if emit(TurnEvent::ItemAdded {
            turn_id: request.turn_id.to_owned(),
            item: Item::Status {
                id: format!("{}-started", request.turn_id),
                kind: StatusKind::Started,
            },
        }) == Flow::Stop
        {
            active.interrupt();
            active.checkpoint(request);
            return Ok(());
        }
        let mut known = HashSet::new();
        let mut last = Instant::now();
        loop {
            if cancelled() {
                active.interrupt();
                active.checkpoint(request);
                return Ok(());
            }
            if last.elapsed() > Duration::from_mins(5) {
                return Err(ErrorCode::CodexStopped);
            }
            let Some(frame) = active.client.next().map_err(code)? else {
                continue;
            };
            last = Instant::now();
            if frame.get("method").is_none() {
                continue;
            }
            if frame.get("id").is_some() {
                let _ = active.client.reject(&frame);
                return Err(ErrorCode::CodexRequestUnsupported);
            }
            let params = &frame["params"];
            if params["threadId"] != active.thread_id {
                continue;
            }
            if frame["method"] == "turn/completed" && params["turn"]["id"] == active.turn_id {
                if !active.checkpoint(request) {
                    return Err(ErrorCode::CodexConversationMissing);
                }
                return match params["turn"]["status"].as_str() {
                    Some("completed") => {
                        emit(TurnEvent::Finished {
                            turn_id: request.turn_id.to_owned(),
                        });
                        Ok(())
                    }
                    Some("interrupted") => {
                        emit(TurnEvent::Stopped {
                            turn_id: request.turn_id.to_owned(),
                        });
                        Ok(())
                    }
                    _ => Err(ErrorCode::CodexCouldNotAnswer),
                };
            }
            if params["turnId"] != active.turn_id {
                continue;
            }
            for event in text_events(&frame, request.turn_id, &mut known) {
                if emit(event) == Flow::Stop {
                    active.interrupt();
                    active.checkpoint(request);
                    return Ok(());
                }
            }
        }
    }
}

fn policy(folder: &Path) -> Value {
    json!({"cwd": folder, "sandbox": "read-only", "approvalPolicy": READ_ONLY_APPROVALS, "approvalsReviewer": "user"})
}

fn opaque(value: &Value) -> Result<String, ErrorCode> {
    value
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 4096)
        .map(str::to_owned)
        .ok_or(ErrorCode::CodexNotUnderstood)
}

fn check_policy(response: &Value, folder: &Path) -> Result<(), ErrorCode> {
    let same_folder = response["cwd"]
        .as_str()
        .and_then(|cwd| std::fs::canonicalize(cwd).ok())
        .zip(std::fs::canonicalize(folder).ok())
        .is_some_and(|(actual, wanted)| actual == wanted);
    if response["approvalPolicy"] != READ_ONLY_APPROVALS
        || response["approvalsReviewer"] != "user"
        || response["sandbox"]["type"] != "readOnly"
        || response["sandbox"]["networkAccess"].as_bool() != Some(false)
        || !same_folder
    {
        return Err(ErrorCode::CodexNotUnderstood);
    }
    Ok(())
}

impl ActiveTurn {
    fn checkpoint(&mut self, request: &ReplyRequest<'_>) -> bool {
        let mut params = policy(request.folder);
        params["threadId"] = json!(self.thread_id);
        params["excludeTurns"] = json!(true);
        // A successful resume is the protocol's confirmation of a rollout, unlike an empty thread id.
        // Failure preserves the visible transcript and refuses a silent replacement on the next turn.
        let result = self
            .client
            .call("thread/resume", params, &|| false, Duration::from_secs(3));
        if let Ok(response) = result
            && response["thread"]["id"] == self.thread_id
            && check_policy(&response, request.folder).is_ok()
        {
            (request.remember)(&self.thread_id);
            return true;
        }
        false
    }

    fn interrupt(&mut self) {
        let _ = self.client.call(
            "turn/interrupt",
            json!({"threadId": self.thread_id, "turnId": self.turn_id}),
            &|| false,
            Duration::from_secs(1),
        );
    }
}

fn code(error: Error) -> ErrorCode {
    match error {
        Error::Protocol | Error::Remote => ErrorCode::CodexNotUnderstood,
        Error::Unsupported => ErrorCode::CodexRequestUnsupported,
        Error::Disconnected | Error::TimedOut | Error::Cancelled => ErrorCode::CodexStopped,
    }
}

fn text_events(frame: &Value, turn_id: &str, known: &mut HashSet<String>) -> Vec<TurnEvent> {
    let params = &frame["params"];
    let method = frame["method"].as_str().unwrap_or_default();
    let mut events = Vec::new();
    if matches!(
        method,
        "item/agentMessage/delta" | "item/reasoning/summaryTextDelta" | "item/reasoning/textDelta"
    ) {
        let (Some(id), Some(text)) = (params["itemId"].as_str(), params["delta"].as_str()) else {
            return events;
        };
        let thinking = method != "item/agentMessage/delta";
        let id = if method == "item/reasoning/textDelta" {
            format!("{id}-raw")
        } else {
            id.to_owned()
        };
        if known.insert(id.clone()) {
            events.push(TurnEvent::ItemAdded {
                turn_id: turn_id.to_owned(),
                item: if thinking {
                    Item::Thinking {
                        id: id.clone(),
                        text: String::new(),
                    }
                } else {
                    Item::Text {
                        id: id.clone(),
                        text: String::new(),
                    }
                },
            });
        }
        events.push(TurnEvent::TextDelta {
            turn_id: turn_id.to_owned(),
            item_id: id,
            text: text.to_owned(),
        });
    } else if method == "item/completed" {
        let item = &params["item"];
        if let Some(id) = item["id"].as_str() {
            let rendered = match item["type"].as_str() {
                Some("agentMessage") => item["text"].as_str().map(|text| Item::Text {
                    id: id.to_owned(),
                    text: text.to_owned(),
                }),
                Some("reasoning") => item["summary"].as_array().map(|parts| Item::Thinking {
                    id: id.to_owned(),
                    text: parts
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("\n"),
                }),
                _ => None,
            };
            if let Some(item) = rendered {
                known.insert(id.to_owned());
                events.push(TurnEvent::ItemAdded {
                    turn_id: turn_id.to_owned(),
                    item,
                });
            }
        }
    }
    events
}

impl AgentDriver for CodexDriver {
    fn reply(&self, request: ReplyRequest<'_>, emit: &mut dyn FnMut(TurnEvent) -> Flow) {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(previous) = self
            .active
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(request.session_id.to_owned(), Arc::clone(&flag))
        {
            previous.store(true, Ordering::Release);
        }
        let cancelled = || {
            if request
                .controls
                .try_iter()
                .any(|control| matches!(control, Control::Stop))
            {
                flag.store(true, Ordering::Release);
            }
            flag.load(Ordering::Acquire)
        };
        let result = self.run(&request, &cancelled, emit);
        if let Err(code) = result
            && !cancelled()
        {
            emit(TurnEvent::ItemAdded {
                turn_id: request.turn_id.to_owned(),
                item: Item::Error {
                    id: format!("{}-codex-error", request.turn_id),
                    message: String::new(),
                    code: Some(code),
                },
            });
            emit(TurnEvent::Failed {
                turn_id: request.turn_id.to_owned(),
            });
        }
        let mut active = self.active.lock().unwrap_or_else(PoisonError::into_inner);
        if active
            .get(request.session_id)
            .is_some_and(|current| Arc::ptr_eq(current, &flag))
        {
            active.remove(request.session_id);
        }
    }

    fn end(&self, session_id: &str) {
        if let Some(flag) = self
            .active
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(session_id)
        {
            flag.store(true, Ordering::Release);
        }
    }
}
