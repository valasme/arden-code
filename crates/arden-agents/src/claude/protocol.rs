//! The frames Arden Code and Claude Code exchange on `claude`'s input and output (ADR 0038). Each
//! line is one JSON object. Only what the driver uses is read: a frame or a field it does not know
//! is skipped, so a newer Claude Code keeps working.

use serde_json::{Value, json};

use super::catalog::{SlashCommand, commands_in};

/// A frame from Claude Code, as far as the driver cares.
#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    /// The session started (`system` / `init`), under this conversation id. It lists the commands
    /// that only make sense in a terminal.
    Init {
        session_id: String,
        terminal_commands: Vec<String>,
    },
    /// The slash commands, again, whole, because they changed (`system` / `commands_changed`).
    CommandsChanged { commands: Vec<SlashCommand> },
    /// A piece of a message while it streams (`stream_event`). A subagent's pieces are marked.
    Stream { event: StreamEvent, subagent: bool },
    /// A complete message from Claude, or some of its blocks (`assistant`). Claude Code puts an
    /// error here when it could not answer, such as when it is signed out.
    Assistant {
        message_id: String,
        blocks: Vec<Block>,
        error: Option<String>,
        subagent: bool,
    },
    /// What tools answered (`user`), with Claude Code's own account of the outcome when it gives
    /// one, such as the patch of an edit.
    ToolResults {
        results: Vec<ToolResult>,
        outcome: Option<Value>,
        subagent: bool,
    },
    /// The end of a turn (`result`).
    Result {
        is_error: bool,
        text: Option<String>,
    },
    /// Claude Code asks Arden Code something and waits for the answer (`control_request`).
    Request { id: String, request: Request },
    /// Claude Code's answer to a request of Arden Code's (`control_response`), with what it
    /// answered: the commands and models, for `initialize`.
    Response {
        id: String,
        error: Option<String>,
        answer: Value,
    },
    /// Claude Code no longer waits for the answer to one of its requests.
    Cancel { id: String },
    /// Claude Code left the conversation for a new one, as when a plan is accepted with its context
    /// cleared (`conversation_reset`).
    ConversationReset { new_id: String },
    /// A frame the driver does not use.
    Other,
}

/// One event of a message as it streams: a part of the Messages API's streaming events.
#[derive(Debug, Clone, PartialEq)]
pub enum StreamEvent {
    MessageStart { message_id: String },
    BlockStart { index: u64, block: Block },
    TextDelta { index: u64, text: String },
    ThinkingDelta { index: u64, text: String },
    Other,
}

/// A block of a message.
#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Text(String),
    Thinking(String),
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    Other,
}

/// What a tool answered.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolResult {
    pub tool_use_id: String,
    /// Its text, without images.
    pub text: String,
    pub is_error: bool,
}

/// What Claude Code asks.
#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    /// Whether a tool may run. For `AskUserQuestion`, the input holds questions for the person.
    CanUseTool(Permission),
    /// A request the driver does not serve, by its subtype.
    Other(String),
}

/// A tool Claude wants to use, waiting for the person's answer.
#[derive(Debug, Clone, PartialEq)]
pub struct Permission {
    pub tool: String,
    pub input: Value,
    pub tool_use_id: Option<String>,
    /// Rules Claude Code suggests, so that the same kind of call is not asked about again.
    pub suggestions: Vec<Value>,
}

fn text_of(value: &Value) -> Option<String> {
    value.as_str().map(str::to_owned)
}

fn subagent(frame: &Value) -> bool {
    frame["parent_tool_use_id"].is_string()
}

fn block(value: &Value) -> Block {
    match value["type"].as_str() {
        Some("text") => Block::Text(text_of(&value["text"]).unwrap_or_default()),
        Some("thinking") => Block::Thinking(text_of(&value["thinking"]).unwrap_or_default()),
        Some("tool_use") => Block::ToolUse {
            id: text_of(&value["id"]).unwrap_or_default(),
            name: text_of(&value["name"]).unwrap_or_default(),
            input: value["input"].clone(),
        },
        _ => Block::Other,
    }
}

fn stream_event(event: &Value) -> StreamEvent {
    let index = event["index"].as_u64().unwrap_or_default();
    match event["type"].as_str() {
        Some("message_start") => StreamEvent::MessageStart {
            message_id: text_of(&event["message"]["id"]).unwrap_or_default(),
        },
        Some("content_block_start") => StreamEvent::BlockStart {
            index,
            block: block(&event["content_block"]),
        },
        Some("content_block_delta") => {
            let delta = &event["delta"];
            match delta["type"].as_str() {
                Some("text_delta") => StreamEvent::TextDelta {
                    index,
                    text: text_of(&delta["text"]).unwrap_or_default(),
                },
                Some("thinking_delta") => StreamEvent::ThinkingDelta {
                    index,
                    text: text_of(&delta["thinking"]).unwrap_or_default(),
                },
                _ => StreamEvent::Other,
            }
        }
        _ => StreamEvent::Other,
    }
}

/// The text of a tool's result: a string, or the text blocks of a list.
fn result_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter(|block| block["type"] == "text")
            .filter_map(|block| block["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn tool_results(frame: &Value) -> Frame {
    let results = frame["message"]["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|block| block["type"] == "tool_result")
                .map(|block| ToolResult {
                    tool_use_id: text_of(&block["tool_use_id"]).unwrap_or_default(),
                    text: result_text(&block["content"]),
                    is_error: block["is_error"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();
    let outcome = &frame["tool_use_result"];
    Frame::ToolResults {
        results,
        outcome: (!outcome.is_null()).then(|| outcome.clone()),
        subagent: subagent(frame),
    }
}

fn request(frame: &Value) -> Frame {
    let id = text_of(&frame["request_id"]).unwrap_or_default();
    let asked = &frame["request"];
    let subtype = text_of(&asked["subtype"]).unwrap_or_default();
    let request = if subtype == "can_use_tool" {
        Request::CanUseTool(Permission {
            tool: text_of(&asked["tool_name"]).unwrap_or_default(),
            input: asked["input"].clone(),
            tool_use_id: text_of(&asked["tool_use_id"]),
            suggestions: asked["permission_suggestions"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        })
    } else {
        Request::Other(subtype)
    };
    Frame::Request { id, request }
}

/// Reads one line from Claude Code. Answers nothing for a line that is not a JSON object.
#[must_use]
pub fn parse(line: &str) -> Option<Frame> {
    let frame: Value = serde_json::from_str(line).ok()?;
    if !frame.is_object() {
        return None;
    }
    Some(match frame["type"].as_str() {
        Some("system") if frame["subtype"] == "init" => Frame::Init {
            session_id: text_of(&frame["session_id"]).unwrap_or_default(),
            terminal_commands: frame["terminal_slash_commands"]
                .as_array()
                .map(|names| names.iter().filter_map(text_of).collect())
                .unwrap_or_default(),
        },
        Some("system") if frame["subtype"] == "commands_changed" => Frame::CommandsChanged {
            commands: commands_in(&frame["commands"]),
        },
        Some("stream_event") => Frame::Stream {
            event: stream_event(&frame["event"]),
            subagent: subagent(&frame),
        },
        Some("assistant") => Frame::Assistant {
            message_id: text_of(&frame["message"]["id"]).unwrap_or_default(),
            blocks: frame["message"]["content"]
                .as_array()
                .map(|blocks| blocks.iter().map(block).collect())
                .unwrap_or_default(),
            error: text_of(&frame["error"]),
            subagent: subagent(&frame),
        },
        Some("user") => tool_results(&frame),
        Some("result") => Frame::Result {
            is_error: frame["is_error"].as_bool().unwrap_or(false),
            text: text_of(&frame["result"]),
        },
        Some("control_request") => request(&frame),
        Some("control_response") => {
            let response = &frame["response"];
            Frame::Response {
                id: text_of(&response["request_id"]).unwrap_or_default(),
                error: (response["subtype"] == "error")
                    .then(|| text_of(&response["error"]).unwrap_or_default()),
                answer: response["response"].clone(),
            }
        }
        Some("conversation_reset") => Frame::ConversationReset {
            new_id: text_of(&frame["new_conversation_id"]).unwrap_or_default(),
        },
        Some("control_cancel_request") => Frame::Cancel {
            id: text_of(&frame["request_id"]).unwrap_or_default(),
        },
        _ => Frame::Other,
    })
}

fn control_request(id: &str, request: &Value) -> String {
    json!({ "type": "control_request", "request_id": id, "request": request }).to_string()
}

fn control_response(id: &str, response: &Value) -> String {
    json!({
        "type": "control_response",
        "response": { "subtype": "success", "request_id": id, "response": response }
    })
    .to_string()
}

/// The first request: Arden Code is ready to talk. It registers no hooks of its own.
#[must_use]
pub fn initialize(id: &str) -> String {
    control_request(id, &json!({ "subtype": "initialize", "hooks": null }))
}

/// Asks for the person's usage limits, without the scan of local transcripts that only `/usage`
/// shows (ADR 0043).
#[must_use]
pub fn get_usage(id: &str) -> String {
    control_request(
        id,
        &json!({ "subtype": "get_usage", "skip_behaviors": true }),
    )
}

/// Stops the turn that is running.
#[must_use]
pub fn interrupt(id: &str) -> String {
    control_request(id, &json!({ "subtype": "interrupt" }))
}

/// The person's message.
#[must_use]
pub fn user_message(text: &str) -> String {
    json!({
        "type": "user",
        "message": { "role": "user", "content": text },
        "parent_tool_use_id": null,
        "session_id": ""
    })
    .to_string()
}

/// Lets a tool run with the input Claude asked for, and hands back the rules to remember, if any.
#[must_use]
pub fn allow(id: &str, input: &Value, rules: &[Value]) -> String {
    let mut answer = json!({ "behavior": "allow", "updatedInput": input });
    if !rules.is_empty() {
        answer["updatedPermissions"] = Value::Array(rules.to_vec());
    }
    control_response(id, &answer)
}

/// Refuses to let a tool run, telling Claude why; `interrupt` also stops the turn.
#[must_use]
pub fn deny(id: &str, message: &str, interrupt: bool) -> String {
    control_response(
        id,
        &json!({ "behavior": "deny", "message": message, "interrupt": interrupt }),
    )
}

/// Answers a request the driver does not serve with an error.
#[must_use]
pub fn refuse(id: &str, reason: &str) -> String {
    json!({
        "type": "control_response",
        "response": { "subtype": "error", "request_id": id, "error": reason }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frames of the real Claude Code 2.1.286, signed out: its answer to `initialize`, then to
    /// a message. Recorded with no API call, and redacted.
    const SIGNED_OUT: &str = include_str!("fixtures/signed-out-2.1.286.ndjson");

    fn frames(text: &str) -> Vec<Frame> {
        text.lines().filter_map(parse).collect()
    }

    #[test]
    fn reads_the_real_claude_codes_answer_to_initialize_and_to_a_message_while_signed_out() {
        let frames = frames(SIGNED_OUT);

        assert_eq!(frames.len(), 7, "every line is a frame");
        assert_eq!(
            frames[2],
            Frame::Response {
                id: "req_1".into(),
                error: None,
                answer: match &frames[2] {
                    Frame::Response { answer, .. } => answer.clone(),
                    other => panic!("not an answer: {other:?}"),
                }
            }
        );
        assert!(
            matches!(&frames[2], Frame::Response { answer, .. } if answer["commands"].is_array() && answer["models"].is_array()),
            "the answer to initialize carries the lists"
        );
        assert!(matches!(
            &frames[3],
            Frame::Init { session_id, terminal_commands }
                if session_id == "00000000-0000-4000-8000-000000000002"
                    && terminal_commands == &["doctor", "color", "focus", "reload-plugins"]
        ));
        assert!(
            matches!(&frames[1], Frame::CommandsChanged { commands } if commands.len() == 49),
            "the push of the commands"
        );
        assert_eq!(
            frames[5],
            Frame::Assistant {
                message_id: frames_message_id(&frames[5]),
                blocks: vec![Block::Text("Not logged in · Please run /login".into())],
                error: Some("authentication_failed".into()),
                subagent: false,
            }
        );
        assert_eq!(
            frames[6],
            Frame::Result {
                is_error: true,
                text: Some("Not logged in · Please run /login".into())
            }
        );
        assert!(matches!(frames[0], Frame::Other));
        assert!(matches!(frames[4], Frame::Other));
    }

    fn frames_message_id(frame: &Frame) -> String {
        match frame {
            Frame::Assistant { message_id, .. } => message_id.clone(),
            _ => String::new(),
        }
    }

    #[test]
    fn reads_a_message_as_it_streams() {
        let lines = [
            r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_1","content":[]}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me look."}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Good "}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"Read","input":{}}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"file"}},"parent_tool_use_id":null,"session_id":"s"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_stop","index":2},"parent_tool_use_id":"toolu_9","session_id":"s"}"#,
        ];

        let read: Vec<Frame> = lines.iter().filter_map(|line| parse(line)).collect();

        let stream = |event, subagent| Frame::Stream { event, subagent };
        assert_eq!(
            read,
            vec![
                stream(
                    StreamEvent::MessageStart {
                        message_id: "msg_1".into()
                    },
                    false
                ),
                stream(
                    StreamEvent::BlockStart {
                        index: 0,
                        block: Block::Thinking(String::new())
                    },
                    false
                ),
                stream(
                    StreamEvent::ThinkingDelta {
                        index: 0,
                        text: "Let me look.".into()
                    },
                    false
                ),
                stream(
                    StreamEvent::BlockStart {
                        index: 1,
                        block: Block::Text(String::new())
                    },
                    false
                ),
                stream(
                    StreamEvent::TextDelta {
                        index: 1,
                        text: "Good ".into()
                    },
                    false
                ),
                stream(
                    StreamEvent::BlockStart {
                        index: 2,
                        block: Block::ToolUse {
                            id: "toolu_1".into(),
                            name: "Read".into(),
                            input: json!({})
                        }
                    },
                    false
                ),
                stream(StreamEvent::Other, false),
                stream(StreamEvent::Other, true),
            ]
        );
    }

    #[test]
    fn reads_a_complete_message_with_a_tool_call() {
        let line = r#"{"type":"assistant","message":{"id":"msg_2","role":"assistant","content":[{"type":"text","text":"Reading it."},{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"C:\\demo\\a.rs"}},{"type":"server_tool_use","id":"x"}]},"parent_tool_use_id":null,"session_id":"s","uuid":"u"}"#;

        assert_eq!(
            parse(line),
            Some(Frame::Assistant {
                message_id: "msg_2".into(),
                blocks: vec![
                    Block::Text("Reading it.".into()),
                    Block::ToolUse {
                        id: "toolu_1".into(),
                        name: "Read".into(),
                        input: json!({ "file_path": r"C:\demo\a.rs" })
                    },
                    Block::Other,
                ],
                error: None,
                subagent: false,
            })
        );
    }

    #[test]
    fn reads_the_results_of_tools_in_either_shape_claude_code_sends_them() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"fn main() {}"},{"type":"tool_result","tool_use_id":"toolu_2","is_error":true,"content":[{"type":"text","text":"No such file"},{"type":"image","source":{}},{"type":"text","text":"Try again"}]}]},"parent_tool_use_id":null,"session_id":"s","tool_use_result":{"type":"create","filePath":"a.rs"}}"#;

        assert_eq!(
            parse(line),
            Some(Frame::ToolResults {
                results: vec![
                    ToolResult {
                        tool_use_id: "toolu_1".into(),
                        text: "fn main() {}".into(),
                        is_error: false
                    },
                    ToolResult {
                        tool_use_id: "toolu_2".into(),
                        text: "No such file\nTry again".into(),
                        is_error: true
                    },
                ],
                outcome: Some(json!({ "type": "create", "filePath": "a.rs" })),
                subagent: false,
            })
        );
    }

    #[test]
    fn reads_claude_codes_requests_and_the_ones_it_gives_up_on() {
        let asks = r#"{"type":"control_request","request_id":"r7","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"npm test","description":"Run the tests"},"tool_use_id":"toolu_3","permission_suggestions":[{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"npm test:*"}],"behavior":"allow","destination":"localSettings"}]}}"#;
        let hook = r#"{"type":"control_request","request_id":"r8","request":{"subtype":"hook_callback","callback_id":"c"}}"#;
        let cancel = r#"{"type":"control_cancel_request","request_id":"r7"}"#;
        let failed = r#"{"type":"control_response","response":{"subtype":"error","request_id":"arden-2","error":"no turn to interrupt"}}"#;

        assert_eq!(
            parse(asks),
            Some(Frame::Request {
                id: "r7".into(),
                request: Request::CanUseTool(Permission {
                    tool: "Bash".into(),
                    input: json!({ "command": "npm test", "description": "Run the tests" }),
                    tool_use_id: Some("toolu_3".into()),
                    suggestions: vec![json!({
                        "type": "addRules",
                        "rules": [{ "toolName": "Bash", "ruleContent": "npm test:*" }],
                        "behavior": "allow",
                        "destination": "localSettings"
                    })],
                })
            })
        );
        assert_eq!(
            parse(hook),
            Some(Frame::Request {
                id: "r8".into(),
                request: Request::Other("hook_callback".into())
            })
        );
        assert_eq!(parse(cancel), Some(Frame::Cancel { id: "r7".into() }));
        assert_eq!(
            parse(failed),
            Some(Frame::Response {
                id: "arden-2".into(),
                error: Some("no turn to interrupt".into()),
                answer: Value::Null
            })
        );
    }

    #[test]
    fn skips_what_it_does_not_know_and_refuses_what_is_not_json() {
        assert_eq!(
            parse(r#"{"type":"rate_limit_event","x":1}"#),
            Some(Frame::Other)
        );
        assert_eq!(parse(r#"{"no_type":true}"#), Some(Frame::Other));
        assert_eq!(parse("Warning: something on stdout"), None);
        assert_eq!(parse(""), None);
    }

    fn value(line: &str) -> Value {
        serde_json::from_str(line).expect("JSON")
    }

    #[test]
    fn writes_the_frames_arden_code_sends() {
        assert_eq!(
            value(&initialize("arden-1")),
            json!({ "type": "control_request", "request_id": "arden-1", "request": { "subtype": "initialize", "hooks": null } })
        );
        assert_eq!(
            value(&interrupt("arden-2")),
            json!({ "type": "control_request", "request_id": "arden-2", "request": { "subtype": "interrupt" } })
        );
        assert_eq!(
            value(&user_message("Fix the \"build\"\nplease")),
            json!({ "type": "user", "message": { "role": "user", "content": "Fix the \"build\"\nplease" }, "parent_tool_use_id": null, "session_id": "" })
        );
        assert_eq!(
            value(&deny("r7", "Not now.", true)),
            json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "r7", "response": { "behavior": "deny", "message": "Not now.", "interrupt": true } } })
        );
        assert_eq!(
            value(&refuse("r8", "not supported")),
            json!({ "type": "control_response", "response": { "subtype": "error", "request_id": "r8", "error": "not supported" } })
        );
        assert!(!initialize("arden-1").contains('\n'), "one frame per line");
    }

    #[test]
    fn allowing_hands_back_the_input_and_any_rule_to_remember() {
        let input = json!({ "command": "npm test" });
        let rule = json!({ "type": "addRules", "rules": [], "behavior": "allow", "destination": "localSettings" });

        assert_eq!(
            value(&allow("r7", &input, &[])),
            json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "r7", "response": { "behavior": "allow", "updatedInput": { "command": "npm test" } } } })
        );
        assert_eq!(
            value(&allow("r7", &input, std::slice::from_ref(&rule))),
            json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "r7", "response": { "behavior": "allow", "updatedInput": { "command": "npm test" }, "updatedPermissions": [rule] } } })
        );
    }
}
