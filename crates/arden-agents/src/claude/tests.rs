//! The Claude driver, run by the store as the app runs it (ADR 0038). Each test plays a script of
//! what Claude Code writes, and checks what the session records and what the driver wrote.

use std::path::Path;
use std::sync::Arc;

use arden_core::error::ErrorCode;
use serde_json::{Value, json};

use super::driver::ClaudeDriver;
use super::launch::{Conversation, LaunchError};
use super::script::{Scripted, Step, handshake};
use crate::model::{AgentKind, Item, ToolStatus, Turn, TurnEvent, TurnStatus};
use crate::playground;
use crate::store::SessionStore;

const FOLDER: &str = r"C:\Projects\demo";

fn store() -> SessionStore {
    SessionStore::new(vec![playground::describe(Path::new(FOLDER))])
}

fn claude(scripts: Vec<Result<Vec<Step>, LaunchError>>) -> (Arc<Scripted>, ClaudeDriver) {
    let scripted = Arc::new(Scripted::new(scripts));
    let driver = ClaudeDriver::new(scripted.clone());
    (scripted, driver)
}

fn claude_session(store: &SessionStore) -> String {
    store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Claude)
        .expect("a session")
        .id
}

/// Sends a message and lets the driver answer it, as the app does. Answers what the UI was sent.
fn send(
    store: &SessionStore,
    driver: &ClaudeDriver,
    session: &str,
    prompt: &str,
) -> Vec<TurnEvent> {
    let turn = store.start_turn(session, prompt).expect("a turn");
    let mut events = Vec::new();
    store
        .stream_reply(driver, session, &turn, |event| {
            events.push(event.clone());
            true
        })
        .expect("saved");
    events
}

fn turn(store: &SessionStore, session: &str, number: usize) -> Turn {
    store.session(session).expect("the session").turns[number].clone()
}

/// A piece of a message, as Claude Code streams it.
fn stream(event: &Value) -> Step {
    Step::Play(
        json!({ "type": "stream_event", "event": event, "parent_tool_use_id": null, "session_id": "c1" }),
    )
}

fn assistant(message_id: &str, content: &Value) -> Step {
    Step::Play(json!({
        "type": "assistant",
        "message": { "id": message_id, "role": "assistant", "content": content },
        "parent_tool_use_id": null,
        "session_id": "c1"
    }))
}

fn message(text: &str) -> Step {
    Step::Expect(json!({ "type": "user", "message": { "role": "user", "content": text } }))
}

fn success(text: &str) -> Step {
    Step::Play(
        json!({ "type": "result", "subtype": "success", "is_error": false, "result": text, "session_id": "c1" }),
    )
}

/// The text and thinking of a turn, in order.
fn texts(turn: &Turn) -> Vec<(&'static str, String)> {
    turn.items
        .iter()
        .filter_map(|item| match item {
            Item::Text { text, .. } => Some(("text", text.clone())),
            Item::Thinking { text, .. } => Some(("thinking", text.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn claude_streams_its_thinking_and_text_and_ends_with_its_result() {
    let mut script = handshake();
    script.extend([
        message("Say hello"),
        Step::Play(json!({ "type": "system", "subtype": "init", "session_id": "c1" })),
        stream(&json!({ "type": "message_start", "message": { "id": "msg_1" } })),
        stream(&json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "thinking", "thinking": "" } })),
        stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "thinking_delta", "thinking": "A greeting." } })),
        stream(&json!({ "type": "content_block_start", "index": 1, "content_block": { "type": "text", "text": "" } })),
        stream(&json!({ "type": "content_block_delta", "index": 1, "delta": { "type": "text_delta", "text": "Good " } })),
        stream(&json!({ "type": "content_block_delta", "index": 1, "delta": { "type": "text_delta", "text": "morning!" } })),
        assistant("msg_1", &json!([{ "type": "thinking", "thinking": "A greeting." }, { "type": "text", "text": "Good morning!" }])),
        success("Good morning!"),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    let events = send(&store, &driver, &session, "Say hello");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(
        texts(&turn),
        vec![
            ("thinking", "A greeting.".to_owned()),
            ("text", "Good morning!".to_owned())
        ]
    );
    assert!(
        events
            .iter()
            .any(|event| matches!(event, TurnEvent::TextDelta { text, .. } if text == "Good ")),
        "the text streamed: {events:#?}"
    );
    assert!(matches!(events.last(), Some(TurnEvent::Finished { .. })));
}

fn tool_result(tool_use_id: &str, content: &str, is_error: bool) -> Step {
    Step::Play(json!({
        "type": "user",
        "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": tool_use_id, "content": content, "is_error": is_error }] },
        "parent_tool_use_id": null,
        "session_id": "c1"
    }))
}

#[test]
fn a_tool_call_shows_what_claude_asked_for_and_ends_with_what_the_tool_answered() {
    let mut script = handshake();
    script.extend([
        message("Build it"),
        stream(&json!({ "type": "message_start", "message": { "id": "msg_1" } })),
        stream(&json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "tool_use", "id": "toolu_1", "name": "Read", "input": {} } })),
        stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "input_json_delta", "partial_json": "{\"file_path\":" } })),
        assistant("msg_1", &json!([{ "type": "tool_use", "id": "toolu_1", "name": "Read", "input": { "file_path": r"C:\Projects\demo\src\main.rs" } }])),
        tool_result("toolu_1", "fn main() {}", false),
        assistant("msg_2", &json!([{ "type": "tool_use", "id": "toolu_2", "name": "Bash", "input": { "command": "cargo build", "description": "Build the project" } }])),
        tool_result("toolu_2", "error[E0601]: `main` function not found", true),
        assistant("msg_3", &json!([{ "type": "text", "text": "The build failed." }])),
        success("The build failed."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    let events = send(&store, &driver, &session, "Build it");

    scripted.assert_followed();
    assert!(
        events.iter().any(|event| matches!(
            event,
            TurnEvent::ItemAdded { item: Item::ToolCall { name, status: ToolStatus::Running, .. }, .. } if name == "Read"
        )),
        "the tool call shows while it runs: {events:#?}"
    );
    let tools: Vec<(String, String, ToolStatus, Option<String>)> = turn(&store, &session, 0)
        .items
        .into_iter()
        .filter_map(|item| match item {
            Item::ToolCall {
                name,
                input,
                status,
                output,
                ..
            } => Some((name, input, status, output)),
            _ => None,
        })
        .collect();
    assert_eq!(
        tools,
        vec![
            (
                "Read".to_owned(),
                r"src\main.rs".to_owned(),
                ToolStatus::Done,
                Some("fn main() {}".to_owned())
            ),
            (
                "Bash".to_owned(),
                "cargo build".to_owned(),
                ToolStatus::Failed,
                Some("error[E0601]: `main` function not found".to_owned())
            ),
        ]
    );
}

/// The real Claude Code 2.1.286, signed out, as recorded with no API call (redacted).
const SIGNED_OUT: &str = include_str!("fixtures/signed-out-2.1.286.ndjson");

#[test]
fn the_real_claude_code_signed_out_fails_the_reply_and_says_how_to_sign_in() {
    let recorded: Vec<Value> = SIGNED_OUT
        .lines()
        .map(|line| serde_json::from_str(line).expect("a frame"))
        .collect();
    let mut script = vec![
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "initialize" } })),
        Step::Play(recorded[0].clone()),
        Step::Play(recorded[1].clone()),
        Step::Answer(recorded[2].clone()),
        message("Say hello"),
    ];
    script.extend(recorded[3..].iter().cloned().map(Step::Play));
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Say hello");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(
        turn.items,
        vec![Item::Error {
            id: format!("{}-error", turn.id),
            message: "Not logged in · Please run /login".into(),
            code: Some(ErrorCode::ClaudeSignedOut),
        }],
        "one error, with Arden Code's code, and no text from it"
    );
}

#[test]
fn claude_codes_own_error_fails_the_reply_with_its_words() {
    let mut script = handshake();
    script.extend([
        message("Hello"),
        Step::Play(json!({
            "type": "assistant",
            "message": { "id": "msg_1", "role": "assistant", "content": [{ "type": "text", "text": "API Error: Overloaded" }] },
            "error": "overloaded",
            "parent_tool_use_id": null,
            "session_id": "c1"
        })),
        Step::Play(json!({ "type": "result", "subtype": "success", "is_error": true, "result": "API Error: Overloaded" })),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Hello");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Failed);
    assert!(matches!(
        &turn.items[..],
        [Item::Error { message, code: Some(ErrorCode::ClaudeCouldNotAnswer), .. }] if message == "API Error: Overloaded"
    ));
}

#[test]
fn until_approvals_arrive_claude_is_told_no_and_carries_on() {
    let mut script = handshake();
    script.extend([
        message("Run the tests"),
        assistant(
            "msg_1",
            &json!([{ "type": "tool_use", "id": "toolu_1", "name": "Bash", "input": { "command": "npm test" } }]),
        ),
        Step::Play(json!({
            "type": "control_request",
            "request_id": "r1",
            "request": { "subtype": "can_use_tool", "tool_name": "Bash", "input": { "command": "npm test" }, "tool_use_id": "toolu_1" }
        })),
        Step::Expect(json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny" } } })),
        tool_result("toolu_1", "This was not allowed.", true),
        success("I could not run them."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Run the tests");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert!(matches!(
        &turn.items[0],
        Item::ToolCall {
            status: ToolStatus::Failed,
            ..
        }
    ));
}

#[test]
fn a_request_arden_code_does_not_serve_is_answered_with_an_error() {
    let mut script = handshake();
    script.extend([
        message("Hello"),
        Step::Play(json!({ "type": "control_request", "request_id": "r1", "request": { "subtype": "hook_callback", "callback_id": "h" } })),
        Step::Expect(json!({ "type": "control_response", "response": { "subtype": "error", "request_id": "r1" } })),
        success("Hello."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Hello");

    scripted.assert_followed();
    assert_eq!(turn(&store, &session, 0).status, TurnStatus::Done);
}

#[test]
fn a_claude_code_that_ends_in_the_middle_fails_the_reply_and_the_next_message_starts_another() {
    let mut first = handshake();
    first.extend([
        message("Hello"),
        assistant("msg_1", &json!([{ "type": "text", "text": "Starting" }])),
        Step::End,
    ]);
    let mut second = handshake();
    second.extend([message("Again"), success("Hello again.")]);
    let (scripted, driver) = claude(vec![Ok(first), Ok(second)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Hello");
    send(&store, &driver, &session, "Again");

    scripted.assert_followed();
    let failed = turn(&store, &session, 0);
    assert_eq!(failed.status, TurnStatus::Failed);
    assert!(failed.items.iter().any(|item| matches!(
        item,
        Item::Error {
            code: Some(ErrorCode::ClaudeStopped),
            ..
        }
    )));
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
    assert_eq!(scripted.starts.lock().expect("starts").len(), 2);
}

#[test]
fn a_sessions_messages_go_to_one_claude_code_in_its_project_with_a_conversation_of_its_own() {
    let mut script = handshake();
    script.extend([
        message("First"),
        success("One."),
        message("Second"),
        success("Two."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
    let starts = scripted.starts.lock().expect("starts");
    assert_eq!(starts.len(), 1, "one Claude Code for the session");
    assert_eq!(starts[0].folder, Path::new(FOLDER));
    let Conversation::New(id) = &starts[0].conversation else {
        panic!("a new conversation: {:?}", starts[0].conversation);
    };
    assert!(uuid::Uuid::parse_str(id).is_ok(), "{id} is a UUID");
}

#[test]
fn a_claude_code_that_cannot_start_fails_the_reply_with_what_to_do() {
    for (problem, code) in [
        (LaunchError::NotInstalled, ErrorCode::ClaudeNotInstalled),
        (
            LaunchError::TooOld("2.1.100".into()),
            ErrorCode::ClaudeTooOld,
        ),
        (LaunchError::NpmWrapperOnly, ErrorCode::ClaudeNpmWrapper),
        (
            LaunchError::Failed("access denied".into()),
            ErrorCode::ClaudeStopped,
        ),
    ] {
        let (_scripted, driver) = claude(vec![Err(problem.clone())]);
        let store = store();
        let session = claude_session(&store);

        send(&store, &driver, &session, "Hello");

        let turn = turn(&store, &session, 0);
        assert_eq!(turn.status, TurnStatus::Failed, "{problem:?}");
        assert!(
            matches!(&turn.items[..], [Item::Error { code: Some(found), .. }] if *found == code),
            "{problem:?}: {:?}",
            turn.items
        );
    }
}

#[test]
fn a_claude_code_that_refuses_to_start_the_conversation_is_not_understood() {
    let script = vec![
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "initialize" } })),
        Step::Answer(
            json!({ "type": "control_response", "response": { "subtype": "error", "error": "unknown request" } }),
        ),
    ];
    let (_scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Hello");

    assert!(matches!(
        &turn(&store, &session, 0).items[..],
        [Item::Error {
            code: Some(ErrorCode::ClaudeNotUnderstood),
            ..
        }]
    ));
}

#[test]
fn a_subagents_own_steps_are_not_shown() {
    let mut script = handshake();
    script.extend([
        message("Look around"),
        assistant(
            "msg_1",
            &json!([{ "type": "tool_use", "id": "toolu_1", "name": "Task", "input": { "description": "Explore the code", "prompt": "Find the parser." } }]),
        ),
        Step::Play(json!({
            "type": "assistant",
            "message": { "id": "msg_sub", "role": "assistant", "content": [{ "type": "tool_use", "id": "toolu_sub", "name": "Grep", "input": { "pattern": "fn" } }] },
            "parent_tool_use_id": "toolu_1",
            "session_id": "c1"
        })),
        tool_result("toolu_1", "Found 3 places.", false),
        success("Done."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Look around");

    scripted.assert_followed();
    let items = turn(&store, &session, 0).items;
    assert_eq!(items.len(), 1, "{items:#?}");
    assert!(matches!(
        &items[0],
        Item::ToolCall { name, input, status: ToolStatus::Done, .. } if name == "Task" && input == "Explore the code"
    ));
}

#[test]
fn a_line_that_is_not_a_frame_is_skipped() {
    let mut script = handshake();
    script.extend([
        message("Hello"),
        Step::PlayLine("Warning: a plugin wrote to standard output".into()),
        assistant("msg_1", &json!([{ "type": "text", "text": "Hello." }])),
        success("Hello."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Hello");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(texts(&turn), vec![("text", "Hello.".to_owned())]);
}

/// Waits until the session's first turn has text, as the person sees it stream.
fn until_text(store: &SessionStore, session: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let streaming = || {
        store
            .session(session)
            .expect("the session")
            .turns
            .first()
            .is_some_and(|first| !texts(first).is_empty())
    };
    while !streaming() {
        assert!(
            std::time::Instant::now() < deadline,
            "the reply never started"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}

#[test]
fn stopping_interrupts_claude_and_the_late_frames_of_the_stopped_reply_change_nothing() {
    let mut script = handshake();
    script.extend([
        message("Write a lot"),
        stream(&json!({ "type": "message_start", "message": { "id": "msg_1" } })),
        stream(&json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "text", "text": "" } })),
        stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Once upon " } })),
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "interrupt" } })),
        Step::Answer(json!({ "type": "control_response", "response": { "subtype": "success", "response": { "still_queued": [] } } })),
        stream(&json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "a time" } })),
        Step::Play(json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "" })),
        message("Next"),
        assistant("msg_2", &json!([{ "type": "text", "text": "Two." }])),
        success("Two."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = Arc::new(store());
    let session = claude_session(&store);
    let driver = Arc::new(driver);
    let replying = {
        let (store, driver, session) = (Arc::clone(&store), Arc::clone(&driver), session.clone());
        std::thread::spawn(move || send(&store, &driver, &session, "Write a lot"))
    };
    until_text(&store, &session);

    store.stop_turn(&session).expect("stopped");
    let events = replying.join().expect("the reply ends");

    assert!(matches!(events.last(), Some(TurnEvent::Stopped { .. })));
    let stopped = turn(&store, &session, 0);
    assert_eq!(stopped.status, TurnStatus::Stopped);
    assert_eq!(texts(&stopped), vec![("text", "Once upon ".to_owned())]);

    send(&store, &driver, &session, "Next");

    scripted.assert_followed();
    assert_eq!(
        texts(&turn(&store, &session, 0)),
        vec![("text", "Once upon ".to_owned())],
        "the stopped reply's late frames changed nothing"
    );
    let next = turn(&store, &session, 1);
    assert_eq!(next.status, TurnStatus::Done);
    assert_eq!(texts(&next), vec![("text", "Two.".to_owned())]);
    assert_eq!(
        scripted.starts.lock().expect("starts").len(),
        1,
        "the same Claude Code"
    );
}

#[test]
fn a_stop_that_comes_after_claude_finished_does_not_stop_the_next_reply() {
    let mut script = handshake();
    script.extend([
        message("First"),
        success("One."),
        message("Second"),
        assistant("msg_2", &json!([{ "type": "text", "text": "Two." }])),
        success("Two."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    // Too late: the reply is over, so there is nothing to stop.
    store.stop_turn(&session).expect("nothing to stop");
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
}
