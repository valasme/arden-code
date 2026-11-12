//! Opt-in capability probes against the person's CLI. No account payload or credentials are logged.
use std::time::{Duration, Instant};

use arden_process::supervisor::Supervisor;
use serde_json::json;

use super::{locate, rpc};

#[test]
#[ignore = "uses the signed-in CLI for two isolated, read-only file-read probes"]
fn real_readonly_approval_pacing() {
    let folder = tempfile::tempdir().expect("an isolated project");
    let logs = tempfile::tempdir().expect("private logs");
    std::fs::write(
        folder.path().join("proof.txt"),
        "CODEX_READONLY_PACING_PROOF\n",
    )
    .expect("a proof file");
    let supervisor = Supervisor::new(logs.path()).expect("a supervisor");
    let located = locate::from_environment().expect("native Codex");
    for pacing in ["untrusted", "never"] {
        let mut client =
            rpc::Client::launch(&supervisor, &located.program, folder.path()).expect("Codex");
        client.initialize(&|| false).expect("initialize");
        assert_ne!(
            client.signed_in(&|| false).expect("account readiness"),
            Some(false)
        );
        let started = client
            .call(
                "thread/start",
                json!({"cwd": folder.path(), "ephemeral": true,
            "sandbox": "read-only", "approvalPolicy": pacing, "approvalsReviewer": "user"}),
                &|| false,
                rpc::PATIENCE,
            )
            .expect("a thread");
        assert_eq!(started["sandbox"]["type"], "readOnly");
        assert_eq!(started["sandbox"]["networkAccess"], false);
        let thread = started["thread"]["id"]
            .as_str()
            .expect("a thread id")
            .to_owned();
        let accepted = client.call("turn/start", json!({"threadId": thread,
            "cwd": folder.path(), "approvalPolicy": pacing, "approvalsReviewer": "user",
            "sandboxPolicy": {"type": "readOnly", "networkAccess": false},
            "input": [{"type": "text", "text": "Read proof.txt in the current project and return only its first line. Do not modify any file or use network tools.", "text_elements": []}]}), &|| false, rpc::PATIENCE).expect("a turn");
        let turn = accepted["turn"]["id"].as_str().expect("a turn id");
        let mut text = String::new();
        let deadline = Instant::now() + Duration::from_secs(60);
        let mut request_kind = "none";
        while Instant::now() < deadline {
            let Some(frame) = client.next().expect("a frame") else {
                continue;
            };
            if frame.get("method").is_some() && frame.get("id").is_some() {
                request_kind = match frame["method"].as_str() {
                    Some("item/commandExecution/requestApproval") => "command-approval",
                    Some("item/permissions/requestApproval") => "additional-permissions",
                    Some("item/tool/requestUserInput") => "user-question",
                    Some("account/chatgptAuthTokens/refresh") => "external-auth-refresh",
                    _ => "other-server-request",
                };
                let _ = client.reject(&frame);
                break;
            }
            if frame["params"]["threadId"] != thread {
                continue;
            }
            if frame["method"] == "item/agentMessage/delta"
                && let Some(delta) = frame["params"]["delta"].as_str()
            {
                text.push_str(delta);
            }
            if frame["method"] == "turn/completed" && frame["params"]["turn"]["id"] == turn {
                break;
            }
        }
        let proof = text.contains("CODEX_READONLY_PACING_PROOF");
        println!(
            "[CODEX-CAPABILITY] policy={pacing}, request={request_kind}, read_proved={proof}, sandbox=readOnly, network=false"
        );
        if pacing == "never" {
            assert!(
                proof,
                "the noninteractive native read-only policy must read its own proof file"
            );
        }
    }
}
