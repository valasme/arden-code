//! The Claude driver, run by the store as the app runs it (ADR 0038). Each test plays a script of
//! what Claude Code writes, and checks what the session records and what the driver wrote.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use arden_core::error::ErrorCode;
use serde_json::{Value, json};

use super::driver::ClaudeDriver;
use super::launch::{Conversation, LaunchError};
use super::script::{Scripted, Step, handshake};
use crate::driver::{AgentDriver, Answer};
use crate::model::{
    AgentKind, ApprovalAction, ApprovalState, Effort, FileChangeKind, Item, Model, Question,
    QuestionAnswer, QuestionOption, QuestionState, StatusKind, ToolStatus, Turn, TurnEvent,
    TurnStatus,
};
use crate::playground;
use crate::store::{SessionStore, StoreError};

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

/// What a tool answered, with Claude Code's own account of what it did.
fn tool_result_with(tool_use_id: &str, content: &str, outcome: &Value) -> Step {
    Step::Play(json!({
        "type": "user",
        "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": tool_use_id, "content": content }] },
        "parent_tool_use_id": null,
        "session_id": "c1",
        "tool_use_result": outcome
    }))
}

#[test]
fn files_claude_edits_and_writes_show_as_file_changes_with_the_lines_added_and_removed() {
    let main = r"C:\Projects\demo\src\main.rs";
    let notes = r"C:\Projects\demo\NOTES.md";
    let readme = r"C:\Projects\demo\README.md";
    let mut script = handshake();
    script.extend([
        message("Tidy up"),
        assistant("msg_1", &json!([{ "type": "tool_use", "id": "toolu_e", "name": "Edit", "input": { "file_path": main, "old_string": "a", "new_string": "b" } }])),
        tool_result_with(
            "toolu_e",
            "The file was updated.",
            &json!({
                "filePath": main,
                "oldString": "a",
                "newString": "b",
                "structuredPatch": [
                    { "oldStart": 1, "oldLines": 3, "newStart": 1, "newLines": 4, "lines": [" fn main() {", "-    a();", "+    b();", "+    c();", " }"] },
                    { "oldStart": 9, "oldLines": 1, "newStart": 10, "newLines": 0, "lines": ["-// old"] }
                ]
            }),
        ),
        assistant("msg_2", &json!([{ "type": "tool_use", "id": "toolu_c", "name": "Write", "input": { "file_path": notes, "content": "one\ntwo\nthree\n" } }])),
        tool_result_with(
            "toolu_c",
            "File created.",
            &json!({ "type": "create", "filePath": notes, "content": "one\ntwo\nthree\n", "structuredPatch": [] }),
        ),
        assistant("msg_3", &json!([{ "type": "tool_use", "id": "toolu_u", "name": "Write", "input": { "file_path": readme, "content": "# Demo\nNew\n" } }])),
        tool_result_with(
            "toolu_u",
            "File updated.",
            &json!({
                "type": "update",
                "filePath": readme,
                "content": "# Demo\nNew\n",
                "structuredPatch": [{ "oldStart": 1, "oldLines": 2, "newStart": 1, "newLines": 2, "lines": [" # Demo", "-Old", "+New"] }]
            }),
        ),
        success("Tidied."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Tidy up");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    let changes: Vec<(String, FileChangeKind, u32, u32)> = turn
        .items
        .iter()
        .filter_map(|item| match item {
            Item::FileChange {
                path,
                change,
                added,
                removed,
                ..
            } => Some((path.clone(), *change, *added, *removed)),
            _ => None,
        })
        .collect();
    assert_eq!(
        changes,
        vec![
            (r"src\main.rs".to_owned(), FileChangeKind::Modified, 2, 2),
            ("NOTES.md".to_owned(), FileChangeKind::Created, 3, 0),
            ("README.md".to_owned(), FileChangeKind::Modified, 1, 1),
        ]
    );
    let edit = turn
        .items
        .iter()
        .position(|item| matches!(item, Item::ToolCall { name, .. } if name == "Edit"))
        .expect("the edit's tool call");
    assert!(
        matches!(&turn.items[edit + 1], Item::FileChange { path, .. } if path == r"src\main.rs"),
        "the change follows its tool call: {:#?}",
        turn.items
    );
}

#[test]
fn a_failed_edit_changes_no_file() {
    let main = r"C:\Projects\demo\src\main.rs";
    let mut script = handshake();
    script.extend([
        message("Edit it"),
        assistant("msg_1", &json!([{ "type": "tool_use", "id": "toolu_e", "name": "Edit", "input": { "file_path": main, "old_string": "a", "new_string": "b" } }])),
        tool_result("toolu_e", "String to replace not found in file.", true),
        success("It did not work."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Edit it");

    scripted.assert_followed();
    assert!(
        !turn(&store, &session, 0)
            .items
            .iter()
            .any(|item| matches!(item, Item::FileChange { .. }))
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
fn questions_that_cannot_be_read_are_answered_no() {
    let mut script = handshake();
    script.extend([
        message("Plan it"),
        Step::Play(json!({
            "type": "control_request",
            "request_id": "r1",
            "request": { "subtype": "can_use_tool", "tool_name": "AskUserQuestion", "input": { "questions": [] }, "tool_use_id": "toolu_1" }
        })),
        Step::Expect(json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny" } } })),
        success("I will decide myself."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Plan it");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert!(
        !turn
            .items
            .iter()
            .any(|item| matches!(item, Item::Questions { .. })),
        "nothing to show: {:#?}",
        turn.items
    );
}

/// What Claude asks: one question to choose one answer to, one to choose several.
fn two_questions() -> Value {
    json!({
        "questions": [
            {
                "question": "Which library should the app use?",
                "header": "Library",
                "options": [
                    { "label": "React", "description": "The one the app already uses" },
                    { "label": "Vue", "description": "" }
                ],
                "multiSelect": false
            },
            {
                "question": "Which checks should run?",
                "header": "Checks",
                "options": [{ "label": "Tests" }, { "label": "Lint" }, { "label": "Types" }],
                "multiSelect": true
            }
        ]
    })
}

/// Claude asks two questions with `AskUserQuestion`: the start of a script.
fn asks_two_questions() -> Vec<Step> {
    let mut script = handshake();
    script.extend([
        message("Set it up"),
        assistant(
            "msg_1",
            &json!([{ "type": "tool_use", "id": "toolu_q", "name": "AskUserQuestion", "input": two_questions() }]),
        ),
        Step::Play(json!({
            "type": "control_request",
            "request_id": "r1",
            "request": { "subtype": "can_use_tool", "tool_name": "AskUserQuestion", "input": two_questions(), "tool_use_id": "toolu_q" }
        })),
    ]);
    script
}

/// Waits until the session's first turn shows questions that wait, and answers their id.
fn until_questions(store: &SessionStore, session: &str) -> String {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let waiting = store
            .session(session)
            .expect("the session")
            .turns
            .first()
            .and_then(|first| {
                first.items.iter().find_map(|item| match item {
                    Item::Questions {
                        id,
                        state: QuestionState::Waiting,
                        ..
                    } => Some(id.clone()),
                    _ => None,
                })
            });
        if let Some(id) = waiting {
            return id;
        }
        assert!(std::time::Instant::now() < deadline, "no questions came");
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}

fn answer(question: &str, answer: &str) -> QuestionAnswer {
    QuestionAnswer {
        question: question.to_owned(),
        answer: answer.to_owned(),
    }
}

#[test]
fn questions_show_with_their_options_and_the_answers_go_back_keyed_by_each_questions_text() {
    let mut script = asks_two_questions();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": "r1",
                "response": {
                    "behavior": "allow",
                    "updatedInput": {
                        "questions": two_questions()["questions"],
                        "answers": {
                            "Which library should the app use?": "React",
                            "Which checks should run?": "Tests, Lint"
                        }
                    }
                }
            }
        })),
        tool_result("toolu_q", "The person answered.", false),
        success("React it is."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);
    let replying = {
        let (store, driver, session) = (Arc::clone(&store), Arc::clone(&driver), session.clone());
        std::thread::spawn(move || send(&store, &driver, &session, "Set it up"))
    };

    let waiting = until_questions(&store, &session);
    store
        .answer_questions(
            &session,
            &waiting,
            vec![
                // Out of order, and with one that was never asked: it is dropped.
                answer("Which checks should run?", "Tests, Lint"),
                answer("Is this asked?", "No"),
                answer("Which library should the app use?", "React"),
            ],
        )
        .expect("answered");
    replying.join().expect("the reply ends");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    let questions = turn
        .items
        .iter()
        .find(|item| matches!(item, Item::Questions { .. }))
        .cloned()
        .expect("the questions");
    assert_eq!(
        questions,
        Item::Questions {
            id: format!("{}-questions-r1", turn.id),
            tool_call_id: Some(format!("{}-toolu_q", turn.id)),
            questions: vec![
                Question {
                    header: "Library".into(),
                    question: "Which library should the app use?".into(),
                    options: vec![
                        QuestionOption {
                            label: "React".into(),
                            description: Some("The one the app already uses".into()),
                        },
                        QuestionOption {
                            label: "Vue".into(),
                            description: None,
                        },
                    ],
                    multi_select: false,
                },
                Question {
                    header: "Checks".into(),
                    question: "Which checks should run?".into(),
                    options: ["Tests", "Lint", "Types"]
                        .into_iter()
                        .map(|label| QuestionOption {
                            label: label.into(),
                            description: None,
                        })
                        .collect(),
                    multi_select: true,
                },
            ],
            answers: vec![
                answer("Which library should the app use?", "React"),
                answer("Which checks should run?", "Tests, Lint"),
            ],
            state: QuestionState::Answered,
        }
    );
    assert!(
        !turn
            .items
            .iter()
            .any(|item| matches!(item, Item::ToolCall { .. })),
        "the card shows the questions, not their tool call: {:#?}",
        turn.items
    );
}

#[test]
fn stopping_while_questions_wait_answers_no_and_cancels_them() {
    let mut script = asks_two_questions();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny" } }
        })),
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "interrupt" } })),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);
    let replying = {
        let (store, driver, session) = (Arc::clone(&store), Arc::clone(&driver), session.clone());
        std::thread::spawn(move || send(&store, &driver, &session, "Set it up"))
    };

    let waiting = until_questions(&store, &session);
    store.stop_turn(&session).expect("stopped");
    replying.join().expect("the reply ends");

    scripted.assert_followed();
    let stopped = turn(&store, &session, 0);
    assert_eq!(stopped.status, TurnStatus::Stopped);
    assert!(stopped.items.iter().any(|item| matches!(
        item,
        Item::Questions { id, state: QuestionState::Cancelled, .. } if *id == waiting
    )));
    assert_eq!(
        store.answer_questions(&session, &waiting, Vec::new()),
        Err(StoreError::NotWaiting),
        "questions that no longer wait take no answers"
    );
}

/// The rule Claude Code suggests for `npm test`.
fn npm_test_rule() -> Value {
    json!({ "type": "addRules", "rules": [{ "toolName": "Bash", "ruleContent": "npm test:*" }], "behavior": "allow", "destination": "localSettings" })
}

/// Claude asks to run the tests, with a rule to remember: the start of a script.
fn asks_to_run_the_tests() -> Vec<Step> {
    let mut script = handshake();
    script.extend([
        message("Run the tests"),
        assistant(
            "msg_1",
            &json!([{ "type": "tool_use", "id": "toolu_1", "name": "Bash", "input": { "command": "npm test", "description": "Run the tests" } }]),
        ),
        Step::Play(json!({
            "type": "control_request",
            "request_id": "r1",
            "request": {
                "subtype": "can_use_tool",
                "tool_name": "Bash",
                "input": { "command": "npm test", "description": "Run the tests" },
                "tool_use_id": "toolu_1",
                "permission_suggestions": [npm_test_rule()]
            }
        })),
    ]);
    script
}

/// Waits until the session's first turn shows an approval request that waits, and answers its id.
fn until_waiting(store: &SessionStore, session: &str) -> String {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let waiting = store
            .session(session)
            .expect("the session")
            .turns
            .first()
            .and_then(|first| {
                first.items.iter().find_map(|item| match item {
                    Item::Approval {
                        id,
                        state: ApprovalState::Waiting,
                        ..
                    } => Some(id.clone()),
                    _ => None,
                })
            });
        if let Some(id) = waiting {
            return id;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "no approval request came"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}

/// Sends a message in another thread, answers the approval request it brings with `answer`, and
/// waits for the reply to end.
fn answer_while_replying(
    store: &Arc<SessionStore>,
    driver: &Arc<ClaudeDriver>,
    session: &str,
    prompt: &str,
    answer: Option<Answer>,
) {
    let replying = {
        let (store, driver, session, prompt) = (
            Arc::clone(store),
            Arc::clone(driver),
            session.to_owned(),
            prompt.to_owned(),
        );
        std::thread::spawn(move || send(&store, &driver, &session, &prompt))
    };
    let waiting = until_waiting(store, session);
    match answer {
        Some(answer) => store.answer(session, &waiting, answer).expect("answered"),
        None => store.stop_turn(session).expect("stopped"),
    }
    replying.join().expect("the reply ends");
}

fn approval_of(turn: &Turn) -> Item {
    turn.items
        .iter()
        .find(|item| matches!(item, Item::Approval { .. }))
        .cloned()
        .expect("an approval request")
}

#[test]
fn an_approval_request_shows_under_its_tool_call_and_allow_lets_the_tool_run() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "allow", "updatedInput": { "command": "npm test", "description": "Run the tests" } } }
        })),
        tool_result("toolu_1", "12 passed", false),
        success("The tests passed."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);

    answer_while_replying(
        &store,
        &driver,
        &session,
        "Run the tests",
        Some(Answer::Allow),
    );

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(
        approval_of(&turn),
        Item::Approval {
            id: format!("{}-approval-r1", turn.id),
            tool_call_id: Some(format!("{}-toolu_1", turn.id)),
            action: ApprovalAction::RunCommand,
            subject: "npm test".into(),
            detail: Some("Run the tests".into()),
            rule: Some("Bash(npm test:*)".into()),
            state: ApprovalState::Allowed,
        }
    );
    let allowed = scripted.written.lock().expect("written")[2].clone();
    assert!(
        allowed["response"]["response"]
            .get("updatedPermissions")
            .is_none(),
        "allowing once remembers nothing: {allowed}"
    );
    assert!(matches!(
        &turn.items[0],
        Item::ToolCall {
            status: ToolStatus::Done,
            ..
        }
    ));
}

#[test]
fn always_allow_hands_back_the_rule_claude_code_suggested() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "allow", "updatedPermissions": [npm_test_rule()] } }
        })),
        tool_result("toolu_1", "12 passed", false),
        success("The tests passed."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);

    answer_while_replying(
        &store,
        &driver,
        &session,
        "Run the tests",
        Some(Answer::AlwaysAllow),
    );

    scripted.assert_followed();
    assert!(matches!(
        approval_of(&turn(&store, &session, 0)),
        Item::Approval {
            state: ApprovalState::AlwaysAllowed,
            ..
        }
    ));
}

#[test]
fn deny_refuses_and_stops_the_reply_and_the_next_message_is_answered() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny", "interrupt": true } }
        })),
        tool_result("toolu_1", "The person denied this.", true),
        Step::Play(json!({ "type": "result", "subtype": "error_during_execution", "is_error": true, "result": "" })),
        message("Do something else"),
        success("Done."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);

    answer_while_replying(
        &store,
        &driver,
        &session,
        "Run the tests",
        Some(Answer::Deny),
    );
    send(&store, &driver, &session, "Do something else");

    scripted.assert_followed();
    let denied = turn(&store, &session, 0);
    assert_eq!(denied.status, TurnStatus::Stopped);
    assert!(matches!(
        approval_of(&denied),
        Item::Approval {
            state: ApprovalState::Denied,
            ..
        }
    ));
    assert!(
        !denied
            .items
            .iter()
            .any(|item| matches!(item, Item::Error { .. })),
        "a denial is not an error: {:#?}",
        denied.items
    );
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
}

#[test]
fn archiving_while_claude_waits_answers_no_and_interrupts() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny" } }
        })),
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "interrupt" } })),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);
    let replying = {
        let (store, driver, session) = (Arc::clone(&store), Arc::clone(&driver), session.clone());
        std::thread::spawn(move || send(&store, &driver, &session, "Run the tests"))
    };

    until_waiting(&store, &session);
    store.set_archived(&session, true).expect("archived");
    replying.join().expect("the reply ends");

    scripted.assert_followed();
    assert!(matches!(
        approval_of(&turn(&store, &session, 0)),
        Item::Approval {
            state: ApprovalState::Cancelled,
            ..
        }
    ));
}

#[test]
fn stopping_while_claude_waits_answers_no_and_interrupts() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Expect(json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": "r1", "response": { "behavior": "deny" } }
        })),
        Step::Expect(json!({ "type": "control_request", "request": { "subtype": "interrupt" } })),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let (store, driver) = (Arc::new(store()), Arc::new(driver));
    let session = claude_session(&store);

    answer_while_replying(&store, &driver, &session, "Run the tests", None);

    scripted.assert_followed();
    let stopped = turn(&store, &session, 0);
    assert_eq!(stopped.status, TurnStatus::Stopped);
    assert!(matches!(
        approval_of(&stopped),
        Item::Approval {
            state: ApprovalState::Cancelled,
            ..
        }
    ));
}

#[test]
fn a_request_claude_code_gives_up_on_is_cancelled() {
    let mut script = asks_to_run_the_tests();
    script.extend([
        Step::Play(json!({ "type": "control_cancel_request", "request_id": "r1" })),
        success("Never mind."),
    ]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "Run the tests");

    scripted.assert_followed();
    let turn = turn(&store, &session, 0);
    assert_eq!(turn.status, TurnStatus::Done);
    assert!(matches!(
        approval_of(&turn),
        Item::Approval {
            state: ApprovalState::Cancelled,
            ..
        }
    ));
}

/// What an approval request for `tool` with `input` says, in a project at `folder`.
fn described(folder: &Path, tool: &str, input: &Value) -> Item {
    let mut script = handshake();
    script.extend([
        message("Change it"),
        Step::Play(json!({
            "type": "control_request",
            "request_id": "r1",
            "request": { "subtype": "can_use_tool", "tool_name": tool, "input": input, "tool_use_id": "toolu_1" }
        })),
        Step::Play(json!({ "type": "control_cancel_request", "request_id": "r1" })),
        success("Never mind."),
    ]);
    let (_scripted, driver) = claude(vec![Ok(script)]);
    let store = SessionStore::new(vec![playground::describe(folder)]);
    let session = claude_session(&store);
    send(&store, &driver, &session, "Change it");
    approval_of(&turn(&store, &session, 0))
}

#[test]
fn an_approval_request_says_what_claude_wants_to_do_with_a_file() {
    let project = tempfile::tempdir().expect("a folder");
    std::fs::write(project.path().join("notes.txt"), "old").expect("a file");
    let at = |name: &str| project.path().join(name).display().to_string();

    let edit = described(
        project.path(),
        "Edit",
        &json!({ "file_path": at("lib.rs"), "old_string": "let a = 1;\nlet b = 2;", "new_string": "let a = 1;\nlet b = 3;" }),
    );
    let created = described(
        project.path(),
        "Write",
        &json!({ "file_path": at("new.txt"), "content": "hello" }),
    );
    let replaced = described(
        project.path(),
        "Write",
        &json!({ "file_path": at("notes.txt"), "content": "new" }),
    );
    let fetched = described(
        project.path(),
        "WebFetch",
        &json!({ "url": "https://example.com/a", "prompt": "Summarize" }),
    );

    assert!(
        matches!(
            edit,
            Item::Approval { action: ApprovalAction::EditFile, ref subject, detail: Some(ref detail), .. }
                if subject == "lib.rs" && detail == "- let a = 1;\n- let b = 2;\n+ let a = 1;\n+ let b = 3;"
        ),
        "{edit:#?}"
    );
    assert!(
        matches!(
            created,
            Item::Approval { action: ApprovalAction::CreateFile, ref subject, detail: Some(ref detail), .. }
                if subject == "new.txt" && detail == "hello"
        ),
        "{created:#?}"
    );
    assert!(
        matches!(
            replaced,
            Item::Approval { action: ApprovalAction::EditFile, ref subject, .. } if subject == "notes.txt"
        ),
        "{replaced:#?}"
    );
    assert!(
        matches!(
            fetched,
            Item::Approval { action: ApprovalAction::OpenPage, ref subject, .. } if subject == "https://example.com/a"
        ),
        "{fetched:#?}"
    );
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

/// A script that answers one message.
fn answers(prompt: &str, reply: &str) -> Vec<Step> {
    let mut script = handshake();
    script.extend([message(prompt), success(reply)]);
    script
}

/// The conversation each start was asked for.
fn conversations(scripted: &Scripted) -> Vec<Conversation> {
    scripted
        .starts
        .lock()
        .expect("starts")
        .iter()
        .map(|start| start.conversation.clone())
        .collect()
}

#[test]
fn claude_code_starts_with_the_session_s_model_and_keeps_running_while_it_stays() {
    let mut script = answers("First", "One.");
    script.extend([message("Second"), success("Two.")]);
    let (scripted, driver) = claude(vec![Ok(script)]);
    let store = store();
    let session = claude_session(&store);
    store
        .set_model(&session, Some(Model::Opus))
        .expect("chosen");

    send(&store, &driver, &session, "First");
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    let starts = scripted.starts.lock().expect("starts");
    assert_eq!(starts.len(), 1, "the same Claude Code answers both");
    assert_eq!(starts[0].model, Some(Model::Opus));
}

#[test]
fn a_new_effort_starts_claude_code_again_with_it() {
    let (scripted, driver) = claude(vec![
        Ok(answers("First", "One.")),
        Ok(answers("Second", "Two.")),
    ]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    store
        .set_effort(&session, Some(Effort::Max))
        .expect("changed");
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    let starts = scripted.starts.lock().expect("starts");
    assert_eq!(
        starts.iter().map(|start| start.effort).collect::<Vec<_>>(),
        [None, Some(Effort::Max)]
    );
    assert!(matches!(starts[1].conversation, Conversation::Resume(_)));
}

#[test]
fn a_new_model_starts_claude_code_again_in_the_same_conversation() {
    let (scripted, driver) = claude(vec![
        Ok(answers("First", "One.")),
        Ok(answers("Second", "Two.")),
    ]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    store
        .set_model(&session, Some(Model::Sonnet))
        .expect("changed");
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
    let starts = scripted.starts.lock().expect("starts");
    assert_eq!(
        starts.iter().map(|start| start.model).collect::<Vec<_>>(),
        [None, Some(Model::Sonnet)]
    );
    let [Conversation::New(first), Conversation::Resume(second)] =
        [&starts[0].conversation, &starts[1].conversation].map(Clone::clone)
    else {
        panic!("a new conversation, then the same one carried on");
    };
    assert_eq!(first, second);
}

#[test]
fn a_session_whose_claude_code_ended_carries_on_its_conversation_in_the_next() {
    let (scripted, driver) = claude(vec![
        Ok(answers("First", "One.")),
        Ok(answers("Second", "Two.")),
    ]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    // Archiving or deleting the session ends its Claude Code.
    driver.end(&session);
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    assert_eq!(turn(&store, &session, 1).status, TurnStatus::Done);
    let conversations = conversations(&scripted);
    let [Conversation::New(first), Conversation::Resume(second)] = &conversations[..] else {
        panic!("a new conversation, then the same one carried on: {conversations:?}");
    };
    assert_eq!(first, second);
}

#[test]
fn a_conversation_claude_code_cannot_find_goes_on_in_a_new_one_and_the_reply_says_so() {
    let (scripted, driver) = claude(vec![
        Ok(answers("First", "One.")),
        // Claude Code ends at once when it has no such conversation.
        Ok(vec![Step::End]),
        Ok(answers("Second", "Two.")),
        Ok(answers("Third", "Three.")),
    ]);
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    driver.end(&session);
    send(&store, &driver, &session, "Second");
    driver.end(&session);
    send(&store, &driver, &session, "Third");

    scripted.assert_followed();
    let second = turn(&store, &session, 1);
    assert_eq!(second.status, TurnStatus::Done);
    assert!(matches!(
        &second.items[0],
        Item::Status {
            kind: StatusKind::NewConversation,
            ..
        }
    ));
    assert!(
        !turn(&store, &session, 2)
            .items
            .iter()
            .any(|item| matches!(item, Item::Status { .. })),
        "the new conversation carries on as usual"
    );
    let conversations = conversations(&scripted);
    let [
        Conversation::New(lost),
        Conversation::Resume(missing),
        Conversation::New(replacement),
        Conversation::Resume(carried),
    ] = &conversations[..]
    else {
        panic!("{conversations:?}");
    };
    assert_eq!(lost, missing);
    assert_ne!(lost, replacement);
    assert_eq!(replacement, carried);
}

#[test]
fn a_claude_code_with_nothing_to_do_for_a_while_is_ended() {
    let scripted = Arc::new(Scripted::new(vec![
        Ok(answers("First", "One.")),
        Ok(answers("Second", "Two.")),
    ]));
    let driver = ClaudeDriver::with_idle_end(scripted.clone(), Duration::from_millis(40));
    let store = store();
    let session = claude_session(&store);

    send(&store, &driver, &session, "First");
    std::thread::sleep(Duration::from_millis(400));
    send(&store, &driver, &session, "Second");

    scripted.assert_followed();
    assert!(matches!(
        &conversations(&scripted)[..],
        [Conversation::New(_), Conversation::Resume(_)]
    ));
}

#[test]
fn a_reply_that_takes_longer_than_the_idle_end_keeps_its_claude_code() {
    let mut script = handshake();
    script.extend([
        message("Take your time"),
        Step::Play(json!({ "type": "system", "subtype": "status" })),
    ]);
    let (scripted, driver) = {
        let scripted = Arc::new(Scripted::new(vec![Ok(script)]));
        let driver = ClaudeDriver::with_idle_end(scripted.clone(), Duration::from_millis(40));
        (scripted, Arc::new(driver))
    };
    let store = Arc::new(store());
    let session = claude_session(&store);
    let replying = {
        let (store, driver, session) = (Arc::clone(&store), Arc::clone(&driver), session.clone());
        std::thread::spawn(move || send(&store, &driver, &session, "Take your time"))
    };

    // Long after the idle end, the reply still runs: its Claude Code is still there to stop.
    std::thread::sleep(Duration::from_millis(400));
    store.stop_turn(&session).expect("stopped");
    replying.join().expect("the reply ends");

    scripted.assert_followed();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    let interrupted = || {
        scripted
            .written
            .lock()
            .expect("written")
            .iter()
            .any(|frame| frame["request"]["subtype"] == "interrupt")
    };
    while !interrupted() {
        assert!(
            std::time::Instant::now() < deadline,
            "the stop never reached the same Claude Code"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
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
