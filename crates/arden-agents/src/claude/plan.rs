//! A plan Claude asks to start (ADR 0044): Claude Code's `ExitPlanMode` tool, asked through
//! `can_use_tool` like an approval request. Starting it answers allow with the permission mode to
//! work in; keeping on planning answers deny with the person's words, without stopping the reply.

use serde_json::{Value, json};

use super::protocol::{self, Permission};
use crate::driver::PlanAnswer;
use crate::model::{Item, PermissionMode, PlanState};

/// The tool Claude asks to leave Plan mode with.
pub const TOOL: &str = "ExitPlanMode";

/// The plan Claude asks to start, waiting for the person. Its text travels in the tool's input;
/// the file Claude Code saves it in is never read (ADR 0039).
pub fn item(turn_id: &str, request_id: &str, permission: &Permission) -> Item {
    Item::Plan {
        id: format!("{turn_id}-plan-{request_id}"),
        tool_call_id: permission
            .tool_use_id
            .as_ref()
            .map(|id| format!("{turn_id}-{id}")),
        plan: permission.input["plan"]
            .as_str()
            .map(str::trim)
            .filter(|plan| !plan.is_empty())
            .map(str::to_owned),
        feedback: None,
        state: PlanState::Waiting,
    }
}

/// The permission mode a plan starts in, when the answer starts it.
pub fn starts_in(answer: PlanAnswer) -> Option<PermissionMode> {
    match answer {
        PlanAnswer::StartAcceptingEdits => Some(PermissionMode::AcceptEdits),
        PlanAnswer::StartAskingFirst => Some(PermissionMode::Manual),
        PlanAnswer::KeepPlanning => None,
    }
}

/// What Claude Code is told of the person's answer, and what becomes of the plan.
pub fn answer(
    request_id: &str,
    input: &Value,
    answer: PlanAnswer,
    feedback: Option<&str>,
) -> (String, PlanState) {
    let start = |mode: PermissionMode| {
        protocol::allow(
            request_id,
            input,
            &[json!({ "type": "setMode", "mode": mode.claude_name(), "destination": "session" })],
        )
    };
    match answer {
        PlanAnswer::StartAcceptingEdits => (
            start(PermissionMode::AcceptEdits),
            PlanState::StartedAcceptingEdits,
        ),
        PlanAnswer::StartAskingFirst => {
            (start(PermissionMode::Manual), PlanState::StartedAskingFirst)
        }
        PlanAnswer::KeepPlanning => {
            let message = match feedback {
                Some(feedback) => {
                    format!("The person wants to keep planning. What should change: {feedback}")
                }
                None => "The person wants to keep planning.".to_owned(),
            };
            // Without an interrupt, Claude carries on planning with the person's words.
            (
                protocol::deny(request_id, &message, false),
                PlanState::KeptPlanning,
            )
        }
    }
}

/// The same plan, answered or given up on.
pub fn with_state(item: &Item, state: PlanState, given: Option<String>) -> Item {
    match item {
        Item::Plan {
            id,
            tool_call_id,
            plan,
            ..
        } => Item::Plan {
            id: id.clone(),
            tool_call_id: tool_call_id.clone(),
            plan: plan.clone(),
            feedback: given,
            state,
        },
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(frame: &str) -> Value {
        serde_json::from_str(frame).expect("JSON")
    }

    #[test]
    fn starting_asking_first_sets_manual_by_claude_code_s_name() {
        let (frame, state) = answer(
            "r2",
            &json!({ "plan": "x" }),
            PlanAnswer::StartAskingFirst,
            None,
        );

        assert_eq!(state, PlanState::StartedAskingFirst);
        assert_eq!(
            value(&frame)["response"]["response"]["updatedPermissions"],
            json!([{ "type": "setMode", "mode": "default", "destination": "session" }])
        );
    }

    #[test]
    fn keeping_on_planning_without_words_still_says_so() {
        let (frame, state) = answer("r2", &json!({}), PlanAnswer::KeepPlanning, None);

        assert_eq!(state, PlanState::KeptPlanning);
        assert_eq!(
            value(&frame)["response"]["response"],
            json!({ "behavior": "deny", "message": "The person wants to keep planning.", "interrupt": false })
        );
    }
}
