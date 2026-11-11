//! Codex discovery and sessions through actual supervised processes (ADR 0065).

#![cfg(any(windows, target_os = "linux"))]

use arden_agents::codex::driver::CodexDriver;
use arden_agents::demo::DemoDriver;
use arden_agents::detect::{self, AgentCli};
use arden_agents::driver::Agents;
use arden_agents::model::{AgentKind, Item, TurnStatus};
use arden_agents::playground;
use arden_agents::store::{SessionStore, StoreError};
use arden_core::error::ErrorCode;
use arden_process::resolve::Lookup;
use arden_process::supervisor::Supervisor;
use serde_json::{Value, json};
use std::sync::Arc;

fn codex_on_path(settings: &Value) -> tempfile::TempDir {
    let bin = tempfile::tempdir().expect("a Codex installation");
    std::fs::copy(
        env!("CARGO_BIN_EXE_codex-stand-in"),
        bin.path()
            .join(format!("codex{}", std::env::consts::EXE_SUFFIX)),
    )
    .expect("the native test stand-in");
    std::fs::write(bin.path().join("stand-in.json"), settings.to_string()).expect("test settings");
    bin
}

struct Rig {
    root: tempfile::TempDir,
    bin: tempfile::TempDir,
    supervisor: Arc<Supervisor>,
}

impl Rig {
    fn new(mut settings: Value) -> Self {
        let root = tempfile::tempdir().expect("private test state");
        std::fs::create_dir(root.path().join("project")).expect("an empty project");
        settings["log"] = json!(root.path().join("trace.jsonl"));
        settings["holdPort"] = json!(true);
        let bin = codex_on_path(&settings);
        let supervisor = Arc::new(Supervisor::new(root.path().join("logs")).expect("a supervisor"));
        Self {
            root,
            bin,
            supervisor,
        }
    }

    fn store(&self) -> SessionStore {
        let opened = SessionStore::open(
            &self.root.path().join("sessions.db"),
            &playground::describe(&self.root.path().join("project")),
            &Agents {
                demo: Arc::new(DemoDriver::instant()),
                claude: Arc::new(DemoDriver::instant()),
                codex: Arc::new(CodexDriver::with_search_path(
                    Arc::clone(&self.supervisor),
                    self.bin.path().as_os_str().to_owned(),
                )),
            },
        );
        assert!(
            opened.problem.is_none(),
            "the test must save rather than fall back to memory"
        );
        opened.store
    }

    fn configure(&self, patch: &Value) {
        let file = self.bin.path().join("stand-in.json");
        let mut current: Value =
            serde_json::from_slice(&std::fs::read(&file).expect("settings")).expect("JSON");
        for (key, value) in patch.as_object().expect("settings to update") {
            current[key] = value.clone();
        }
        std::fs::write(file, current.to_string()).expect("updated fixture settings");
    }

    fn frames(&self) -> Vec<Value> {
        std::fs::read_to_string(self.root.path().join("trace.jsonl"))
            .expect("fixture trace")
            // A forced process termination may cut its final log record in the middle. Only a
            // newline commits a record; malformed complete records still fail this test helper.
            .split_inclusive('\n')
            .filter(|line| line.ends_with('\n'))
            .map(|line| serde_json::from_str(line).expect("a frame"))
            .collect()
    }

    fn assert_child_released_its_resource(&self) {
        let ports: Vec<u16> = self
            .frames()
            .iter()
            .filter_map(|frame| frame["heldPort"].as_u64())
            .map(|port| u16::try_from(port).expect("a port"))
            .collect();
        assert!(
            !ports.is_empty(),
            "a real fixture process must have owned the resource"
        );
        for port in ports {
            let _released = std::net::TcpListener::bind(("127.0.0.1", port))
                .expect("the Codex process released its resource");
        }
    }
}

fn codex_session(store: &SessionStore) -> String {
    store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Codex.into())
        .expect("a Codex session")
        .id
}

fn answer(store: &SessionStore, session_id: &str, prompt: &str) -> arden_agents::model::Session {
    let turn = store.start_turn(session_id, prompt).expect("a turn");
    store
        .stream_reply(session_id, &turn, |_| true)
        .expect("a saved reply");
    store.session(session_id).expect("the session")
}

fn assert_failed(session: &arden_agents::model::Session, code: ErrorCode) {
    let turn = session.turns.last().expect("a turn");
    assert_eq!(turn.status, TurnStatus::Failed, "{:?}", turn.items);
    assert!(
        turn.items
            .iter()
            .any(|item| matches!(item, Item::Error { code: Some(actual), .. } if *actual == code)),
        "{:?}",
        turn.items
    );
}

#[test]
fn stop_interrupts_only_its_native_turn_discards_late_text_and_releases_the_child() {
    let rig = Rig::new(json!({"hang": true}));
    let store = rig.store();
    let session_id = codex_session(&store);
    let turn = store
        .start_turn(&session_id, "work until stopped")
        .expect("a turn");
    let began = std::time::Instant::now();
    let mut stopped = false;
    store
        .stream_reply(&session_id, &turn, |event| {
            if !stopped && matches!(event, arden_agents::model::TurnEvent::TextDelta { .. }) {
                store.stop_turn(&session_id).expect("Stop");
                stopped = true;
            }
            true
        })
        .expect("the stopped reply");
    assert!(stopped);
    assert!(began.elapsed() < std::time::Duration::from_secs(10));
    let saved = store.session(&session_id).expect("the transcript");
    assert_eq!(saved.turns[0].status, TurnStatus::Stopped);
    assert!(
        !saved.turns[0].items.iter().any(
            |item| matches!(item, Item::Text { text, .. } if text.contains("MUST NOT APPEAR"))
        )
    );
    let frames = rig.frames();
    let native = frames
        .iter()
        .find(|frame| frame.get("active").is_some())
        .expect("the active native turn");
    let interrupted = frames
        .iter()
        .find(|frame| frame["method"] == "turn/interrupt")
        .expect("a native interrupt");
    assert_eq!(
        interrupted["params"]["threadId"],
        native["active"]["threadId"]
    );
    assert_eq!(interrupted["params"]["turnId"], native["active"]["turnId"]);
    rig.assert_child_released_its_resource();
}

#[test]
fn stop_ends_descendants_that_hold_the_servers_pipes_instead_of_waiting_for_them() {
    let rig = Rig::new(json!({"hang": true, "descendant": true}));
    let store = rig.store();
    let session = codex_session(&store);
    let turn = store.start_turn(&session, "work").expect("a turn");
    let mut stopping = None;
    store
        .stream_reply(&session, &turn, |event| {
            if stopping.is_none()
                && matches!(event, arden_agents::model::TurnEvent::TextDelta { .. })
            {
                stopping = Some(std::time::Instant::now());
                store.stop_turn(&session).expect("Stop");
            }
            true
        })
        .expect("the stopped reply");
    assert!(
        stopping.expect("Stop was exercised").elapsed() < std::time::Duration::from_secs(2),
        "waiting for an inherited pipe must not hold the reply open"
    );
    assert!(
        rig.frames()
            .iter()
            .any(|frame| frame["spawnedDescendant"].is_u64())
    );
    rig.assert_child_released_its_resource();
}

#[test]
fn rust_refuses_an_untrusted_codex_project_before_starting_a_process() {
    let rig = Rig::new(json!({}));
    let store = rig.store();
    let folder = rig.root.path().join("untrusted");
    std::fs::create_dir(&folder).expect("a folder");
    let project = store.open_folder(&folder).expect("a project");
    let session = store
        .create_session(&project.id, AgentKind::Codex.into())
        .expect("a session");
    assert!(matches!(
        store.start_turn(&session.id, "hello"),
        Err(StoreError::NotTrusted)
    ));
    assert!(
        !rig.root.path().join("trace.jsonl").exists(),
        "no Codex process ran"
    );
}

#[test]
fn archive_delete_and_project_removal_end_only_the_owned_codex_work_without_resurrection() {
    for action in ["archive", "delete", "removeProject"] {
        let rig = Rig::new(json!({"hang": true, "descendant": true}));
        let store = rig.store();
        let folder = rig.root.path().join("trusted");
        std::fs::create_dir(&folder).expect("a folder");
        let project = store.open_folder(&folder).expect("a project");
        store.trust_project(&project.id).expect("trust the project");
        let session = store
            .create_session(&project.id, AgentKind::Codex.into())
            .expect("a session");
        let turn = store.start_turn(&session.id, "work").expect("a turn");
        let mut changed = false;
        let outcome = store.stream_reply(&session.id, &turn, |event| {
            if !changed && matches!(event, arden_agents::model::TurnEvent::TextDelta { .. }) {
                changed = true;
                match action {
                    "archive" => store.set_archived(&session.id, true).expect("archive"),
                    "delete" => store.delete(&session.id).expect("delete"),
                    "removeProject" => {
                        store
                            .remove_project(&project.id)
                            .expect("remove the project");
                    }
                    _ => unreachable!("only the listed cleanup cases"),
                }
            }
            true
        });
        assert!(
            changed,
            "the lifecycle operation ran during an actual streamed turn"
        );
        if let Err(error) = outcome {
            assert!(action != "archive" && matches!(error, StoreError::UnknownSession));
        }
        if action == "archive" {
            let kept = store.session(&session.id).expect("the archived session");
            assert!(kept.archived_at.is_some());
            assert_eq!(kept.turns[0].status, TurnStatus::Stopped);
        } else {
            assert!(
                store.session(&session.id).is_err(),
                "late events did not recreate the session"
            );
        }
        rig.assert_child_released_its_resource();
    }
}

#[test]
fn unsupported_authority_requests_fail_closed_instead_of_approving_or_hanging() {
    for method in [
        "item/commandExecution/requestApproval",
        "item/tool/requestUserInput",
        "future/authorityRequest",
    ] {
        let rig = Rig::new(json!({"request": method}));
        let store = rig.store();
        let session = codex_session(&store);
        assert_failed(
            &answer(&store, &session, "a task"),
            ErrorCode::CodexRequestUnsupported,
        );
        rig.assert_child_released_its_resource();
    }
}

#[test]
fn malformed_protocol_and_weakened_native_policy_are_coded_failures() {
    for settings in [json!({"malformed": true}), json!({"unsafePolicy": true})] {
        let rig = Rig::new(settings);
        let store = rig.store();
        let session = codex_session(&store);
        assert_failed(
            &answer(&store, &session, "a task"),
            ErrorCode::CodexNotUnderstood,
        );
        assert!(
            !rig.frames()
                .iter()
                .any(|frame| frame["method"] == "turn/start")
        );
        rig.assert_child_released_its_resource();
    }
}

#[test]
fn unconfirmed_history_is_not_silently_replaced_even_after_an_app_restart() {
    let rig = Rig::new(json!({"noRollout": true}));
    let store = rig.store();
    let session = codex_session(&store);
    assert_failed(
        &answer(&store, &session, "first"),
        ErrorCode::CodexConversationMissing,
    );
    drop(store);
    let reopened = rig.store();
    assert_failed(
        &answer(&reopened, &session, "continue"),
        ErrorCode::CodexConversationMissing,
    );
    assert_eq!(
        rig.frames()
            .iter()
            .filter(|frame| frame["method"] == "thread/start")
            .count(),
        1
    );
    rig.assert_child_released_its_resource();
}

#[test]
fn a_missing_saved_rollout_preserves_the_transcript_and_never_starts_a_replacement_thread() {
    let rig = Rig::new(json!({}));
    let store = rig.store();
    let session = codex_session(&store);
    let first = answer(&store, &session, "first");
    assert_eq!(first.turns[0].status, TurnStatus::Done);
    drop(store);
    rig.configure(&json!({"missingRollout": true}));
    let reopened = rig.store();
    let saved = answer(&reopened, &session, "continue");
    assert_failed(&saved, ErrorCode::CodexConversationMissing);
    assert!(
        saved.turns[0]
            .items
            .iter()
            .any(|item| matches!(item, Item::Text { text, .. } if text == "You said: first"))
    );
    assert_eq!(
        rig.frames()
            .iter()
            .filter(|frame| frame["method"] == "thread/start")
            .count(),
        1
    );
    rig.assert_child_released_its_resource();
}

#[test]
fn published_reasoning_is_streamed_but_other_threads_and_turns_cannot_enter_the_transcript() {
    let rig = Rig::new(json!({"thinking": true, "foreignEvents": true}));
    let store = rig.store();
    let session = codex_session(&store);
    let saved = answer(&store, &session, "hello");
    assert_eq!(saved.turns[0].status, TurnStatus::Done);
    assert!(saved.turns[0].items.iter().any(|item| matches!(item, Item::Thinking { text, .. } if text == "A published reasoning summary.")));
    assert!(
        !saved.turns[0]
            .items
            .iter()
            .any(|item| matches!(item, Item::Text { text, .. } if text.contains("FOREIGN OUTPUT")))
    );
    rig.assert_child_released_its_resource();
}

#[test]
fn detection_reads_only_codexs_sign_in_state_through_its_native_app_server() {
    let logs = tempfile::tempdir().expect("private test logs");
    let supervisor = Supervisor::new(logs.path()).expect("a supervisor");
    for signed_in in [true, false] {
        let bin = codex_on_path(&json!({"signedIn": signed_in}));
        let found = detect::detect(
            &supervisor,
            AgentCli::Codex,
            bin.path().as_os_str(),
            &Lookup::of_this_platform(),
        );
        assert!(found.installed);
        assert_eq!(found.version.as_deref(), Some("0.167.1"));
        assert_eq!(found.signed_in, Some(signed_in));
    }
    for entry in std::fs::read_dir(logs.path()).expect("the logs") {
        let text = std::fs::read_to_string(entry.expect("a log").path()).expect("readable log");
        assert!(
            !text.contains("private-account-field@example.invalid"),
            "{text}"
        );
    }
}

#[test]
fn readiness_distinguishes_absence_incompatibility_sign_in_and_unknown_answers() {
    let logs = tempfile::tempdir().expect("logs");
    let supervisor = Supervisor::new(logs.path()).expect("a supervisor");
    let empty = tempfile::tempdir().expect("an empty PATH");
    let absent = detect::detect(
        &supervisor,
        AgentCli::Codex,
        empty.path().as_os_str(),
        &Lookup::of_this_platform(),
    );
    assert_eq!(
        serde_json::to_value(absent).expect("detection")["readiness"],
        "missing"
    );
    for (settings, expected) in [
        (json!({"signedIn": true}), "ready"),
        (json!({"signedIn": false}), "signedOut"),
        (json!({"compatible": false}), "incompatible"),
        (json!({"unknownAccount": true}), "unknown"),
    ] {
        let bin = codex_on_path(&settings);
        let found = detect::detect(
            &supervisor,
            AgentCli::Codex,
            bin.path().as_os_str(),
            &Lookup::of_this_platform(),
        );
        assert_eq!(
            serde_json::to_value(found).expect("detection")["readiness"],
            expected
        );
    }
}

#[test]
fn codex_answers_through_its_own_supervised_protocol_in_the_project() {
    let project = tempfile::tempdir().expect("the Playground");
    let logs = tempfile::tempdir().expect("private agent logs");
    let trace = project.path().join("protocol.jsonl");
    let bin = codex_on_path(&json!({"log": trace}));
    let supervisor = Arc::new(Supervisor::new(logs.path()).expect("a supervisor"));
    let driver = Arc::new(CodexDriver::with_search_path(
        supervisor,
        bin.path().as_os_str().to_owned(),
    ));
    let store = SessionStore::new(
        vec![playground::describe(project.path())],
        Agents {
            demo: Arc::new(DemoDriver::instant()),
            claude: Arc::new(DemoDriver::instant()),
            codex: driver,
        },
    );
    let session = store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Codex.into())
        .expect("a Codex session");
    let turn = store
        .start_turn(&session.id, "hello-private-prompt")
        .expect("a turn");
    let mut streamed = Vec::new();
    store
        .stream_reply(&session.id, &turn, |event| {
            streamed.push(event.clone());
            true
        })
        .expect("saved reply");
    let saved = store.session(&session.id).expect("the session");
    assert_eq!(
        saved.turns[0].status,
        TurnStatus::Done,
        "{:?}",
        saved.turns[0].items
    );
    assert!(saved.turns[0].items.iter().any(
        |item| matches!(item, Item::Text { text, .. } if text == "You said: hello-private-prompt")
    ));
    assert!(
        streamed
            .iter()
            .any(|event| matches!(event, arden_agents::model::TurnEvent::TextDelta { .. }))
    );
    let frames: Vec<Value> = std::fs::read_to_string(trace)
        .expect("fixture trace")
        .lines()
        .map(|line| serde_json::from_str(line).expect("a frame"))
        .collect();
    let initialized = frames
        .iter()
        .find(|frame| frame["method"] == "initialize")
        .expect("initialize");
    assert_eq!(initialized["params"]["clientInfo"]["name"], "arden_code");
    assert_eq!(
        initialized["params"]["capabilities"]["experimentalApi"],
        false
    );
    let started = frames
        .iter()
        .find(|frame| frame["method"] == "thread/start")
        .expect("a native thread");
    assert_eq!(started["params"]["sandbox"], "read-only");
    assert_eq!(started["params"]["approvalPolicy"], "never");
    assert_eq!(
        std::path::Path::new(started["params"]["cwd"].as_str().expect("a folder")),
        project.path()
    );
    for entry in std::fs::read_dir(logs.path()).expect("agent logs") {
        let text = std::fs::read_to_string(entry.expect("a log").path()).expect("readable log");
        assert!(
            !text.contains("hello-private-prompt")
                && !text.contains("private-account-field@example.invalid")
        );
    }
}

#[test]
#[ignore = "uses the person's signed-in Codex account for two minimal read-only model turns"]
fn real_codex_sends_and_resumes_after_reopening_the_store() {
    let project = tempfile::tempdir().expect("an empty Playground");
    let state = tempfile::tempdir().expect("private smoke-test state");
    let logs = tempfile::tempdir().expect("private smoke-test logs");
    let supervisor = Arc::new(Supervisor::new(logs.path()).expect("a supervisor"));
    let open = || {
        let opened = SessionStore::open(
            &state.path().join("sessions.db"),
            &playground::describe(project.path()),
            &Agents {
                demo: Arc::new(DemoDriver::instant()),
                claude: Arc::new(DemoDriver::instant()),
                codex: Arc::new(CodexDriver::new(Some(Arc::clone(&supervisor)))),
            },
        );
        assert!(
            opened.problem.is_none(),
            "the smoke test must save, not fall back to memory"
        );
        opened.store
    };
    let store = open();
    let session = store
        .create_session(playground::PLAYGROUND_ID, AgentKind::Codex.into())
        .expect("a Codex session");
    let turn = store.start_turn(&session.id, "Do not use tools or read files. Reply with exactly this token and nothing else: ARDEN_CODE_CODEX_SMOKE_OK").expect("a turn");
    store
        .stream_reply(&session.id, &turn, |_| true)
        .expect("saved reply");
    let first = store.session(&session.id).expect("the reply");
    assert_eq!(
        first.turns[0].status,
        TurnStatus::Done,
        "{:?}",
        first.turns[0].items
    );
    assert!(first.turns[0].items.iter().any(
        |item| matches!(item, Item::Text { text, .. } if text.contains("ARDEN_CODE_CODEX_SMOKE_OK"))
    ));
    drop(store);
    let reopened = open();
    let turn = reopened.start_turn(&session.id, "Do not use tools or read files. Repeat the exact confirmation token from your previous reply, with no other text.").expect("a resumed turn");
    reopened
        .stream_reply(&session.id, &turn, |_| true)
        .expect("saved resumed reply");
    let second = reopened.session(&session.id).expect("the saved session");
    assert_eq!(
        second.turns[1].status,
        TurnStatus::Done,
        "{:?}",
        second.turns[1].items
    );
    assert!(second.turns[1].items.iter().any(
        |item| matches!(item, Item::Text { text, .. } if text.contains("ARDEN_CODE_CODEX_SMOKE_OK"))
    ));
    println!(
        "Real Codex: first reply and cross-process history resume both returned the requested confirmation token."
    );
}

#[cfg(windows)]
mod windows {
    use arden_agents::detect::{self, AgentCli};
    use arden_process::resolve::Lookup;
    use arden_process::supervisor::Supervisor;

    #[test]
    fn npm_codex_is_resolved_to_its_native_optional_package_without_running_the_wrapper() {
        let npm = tempfile::tempdir().expect("an npm prefix");
        let logs = tempfile::tempdir().expect("private test logs");
        let supervisor = Supervisor::new(logs.path()).expect("a supervisor");
        std::fs::write(
            npm.path().join("codex.cmd"),
            "@echo off\r\necho WRAPPER_WAS_RUN\r\n",
        )
        .expect("the wrapper");
        let package = npm.path().join("node_modules/@openai/codex");
        let native = package.join(
            "node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
        );
        std::fs::create_dir_all(native.parent().expect("a folder")).expect("the package folders");
        std::fs::write(package.join("package.json"), r#"{"version":"0.167.1"}"#)
            .expect("the package metadata");
        // Enough to identify a native candidate, deliberately not a runnable executable. The
        // detector must retain an unknown version rather than execute the wrapper as a fallback.
        std::fs::write(&native, b"MZ a native program placeholder").expect("the native candidate");

        let found = detect::detect(
            &supervisor,
            AgentCli::Codex,
            npm.path().as_os_str(),
            &Lookup::Extensions(".EXE;.CMD".into()),
        );

        assert!(found.installed);
        assert_eq!(
            found.path.as_deref().map(std::path::Path::new),
            Some(native.as_path())
        );
        assert_eq!(found.version, None);
        for entry in std::fs::read_dir(logs.path()).expect("the logs") {
            let log = std::fs::read_to_string(entry.expect("a log").path()).expect("readable log");
            assert!(!log.contains("WRAPPER_WAS_RUN"), "{log}");
        }
    }
}
