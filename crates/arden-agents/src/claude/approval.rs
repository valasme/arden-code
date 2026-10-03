//! An approval request, as Claude Code's `can_use_tool` asks it (ADR 0039): what Claude wants to do,
//! in Arden Code's words, the details to decide by, and the rule Claude Code suggests remembering.

use std::path::Path;

use serde_json::Value;

use super::protocol::Permission;
use super::reply::{cut, relative};
use crate::model::{ApprovalAction, ApprovalState, Item};

/// The most lines, and characters, of the details shown with a request.
const DETAIL_LINES: usize = 40;
const DETAIL_LENGTH: usize = 4000;

/// Details cut to what fits on the card.
fn shortened(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut kept = lines
        .iter()
        .take(DETAIL_LINES)
        .copied()
        .collect::<Vec<_>>()
        .join("\n");
    if lines.len() > DETAIL_LINES {
        kept.push_str("\n…");
    }
    cut(&kept, DETAIL_LENGTH)
}

/// An edit as lines taken out and lines put in.
fn change(old: &str, new: &str) -> String {
    old.lines()
        .map(|line| format!("- {line}"))
        .chain(new.lines().map(|line| format!("+ {line}")))
        .collect::<Vec<_>>()
        .join("\n")
}

/// What Claude wants to do, the line that says it, and the details.
fn describe(permission: &Permission, folder: &Path) -> (ApprovalAction, String, Option<String>) {
    let input = &permission.input;
    let field = |name: &str| input[name].as_str().unwrap_or_default().to_owned();
    let path = |name: &str| relative(&field(name), folder);
    match permission.tool.as_str() {
        "Bash" | "PowerShell" => (
            ApprovalAction::RunCommand,
            field("command"),
            input["description"].as_str().map(str::to_owned),
        ),
        "Edit" => (
            ApprovalAction::EditFile,
            path("file_path"),
            Some(shortened(&change(
                &field("old_string"),
                &field("new_string"),
            ))),
        ),
        "MultiEdit" => {
            let edits = input["edits"].as_array().cloned().unwrap_or_default();
            let changes: Vec<String> = edits
                .iter()
                .map(|edit| {
                    change(
                        edit["old_string"].as_str().unwrap_or_default(),
                        edit["new_string"].as_str().unwrap_or_default(),
                    )
                })
                .collect();
            (
                ApprovalAction::EditFile,
                path("file_path"),
                Some(shortened(&changes.join("\n"))),
            )
        }
        "Write" => {
            let target = folder.join(field("file_path"));
            let action = if target.exists() {
                ApprovalAction::EditFile
            } else {
                ApprovalAction::CreateFile
            };
            (
                action,
                path("file_path"),
                Some(shortened(&field("content"))),
            )
        }
        "NotebookEdit" => (
            ApprovalAction::EditFile,
            path("notebook_path"),
            Some(shortened(&field("new_source"))),
        ),
        "WebFetch" => (
            ApprovalAction::OpenPage,
            field("url"),
            input["prompt"].as_str().map(str::to_owned),
        ),
        "WebSearch" => (ApprovalAction::SearchWeb, field("query"), None),
        tool => {
            let detail = match input {
                Value::Object(fields) if fields.is_empty() => None,
                Value::Null => None,
                other => serde_json::to_string_pretty(other)
                    .ok()
                    .map(|text| shortened(&text)),
            };
            (ApprovalAction::UseTool, tool.to_owned(), detail)
        }
    }
}

/// The rule Claude Code suggests remembering, in a line such as `Bash(npm test:*)`, with the
/// suggestion to hand back when the person always allows.
pub fn rule_of(suggestions: &[Value]) -> Option<(String, Value)> {
    let suggestion = suggestions
        .iter()
        .find(|suggestion| suggestion["type"] == "addRules" && suggestion["behavior"] == "allow")?;
    let rules: Vec<String> = suggestion["rules"]
        .as_array()?
        .iter()
        .filter_map(|rule| {
            let tool = rule["toolName"].as_str()?;
            Some(match rule["ruleContent"].as_str() {
                Some(content) if !content.is_empty() => format!("{tool}({content})"),
                _ => tool.to_owned(),
            })
        })
        .collect();
    (!rules.is_empty()).then(|| (rules.join(", "), suggestion.clone()))
}

/// The approval request for a permission Claude Code asks for, waiting for the person.
pub fn item(turn_id: &str, request_id: &str, permission: &Permission, folder: &Path) -> Item {
    let (action, subject, detail) = describe(permission, folder);
    Item::Approval {
        id: format!("{turn_id}-approval-{request_id}"),
        tool_call_id: permission
            .tool_use_id
            .as_ref()
            .map(|id| format!("{turn_id}-{id}")),
        action,
        subject,
        detail,
        rule: rule_of(&permission.suggestions).map(|(rule, _)| rule),
        state: ApprovalState::Waiting,
    }
}

/// The same request, in another state.
pub fn with_state(item: &Item, state: ApprovalState) -> Item {
    match item {
        Item::Approval {
            id,
            tool_call_id,
            action,
            subject,
            detail,
            rule,
            ..
        } => Item::Approval {
            id: id.clone(),
            tool_call_id: tool_call_id.clone(),
            action: *action,
            subject: subject.clone(),
            detail: detail.clone(),
            rule: rule.clone(),
            state,
        },
        other => other.clone(),
    }
}
