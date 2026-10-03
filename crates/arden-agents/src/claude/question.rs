//! Claude's questions (ADR 0039): Claude Code's `AskUserQuestion` tool, asked through
//! `can_use_tool` like an approval request, and answered by handing the tool its input back with
//! the person's answers, keyed by each question's text.

use serde_json::{Map, Value};

use super::protocol::Permission;
use crate::model::{Item, Question, QuestionAnswer, QuestionOption, QuestionState};

/// The tool Claude asks its questions with.
pub const TOOL: &str = "AskUserQuestion";

/// A field's text, when it has some.
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// The questions in the tool's input. One without text is left out.
fn questions(input: &Value) -> Vec<Question> {
    let Some(asked) = input["questions"].as_array() else {
        return Vec::new();
    };
    asked
        .iter()
        .filter_map(|asked| {
            let options = asked["options"]
                .as_array()
                .map(|options| {
                    options
                        .iter()
                        .filter_map(|option| {
                            Some(QuestionOption {
                                label: text(&option["label"])?,
                                description: text(&option["description"]),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            Some(Question {
                header: text(&asked["header"]).unwrap_or_default(),
                question: text(&asked["question"])?,
                options,
                multi_select: asked["multiSelect"].as_bool().unwrap_or(false),
            })
        })
        .collect()
}

/// The questions Claude Code asks, waiting for the person, or nothing when none can be read.
pub fn item(turn_id: &str, request_id: &str, permission: &Permission) -> Option<Item> {
    let questions = questions(&permission.input);
    if questions.is_empty() {
        return None;
    }
    Some(Item::Questions {
        id: format!("{turn_id}-questions-{request_id}"),
        tool_call_id: permission
            .tool_use_id
            .as_ref()
            .map(|id| format!("{turn_id}-{id}")),
        questions,
        answers: Vec::new(),
        state: QuestionState::Waiting,
    })
}

/// The answers to questions that were asked, in the order they were asked; others are dropped.
pub fn to_asked(item: &Item, answers: &[QuestionAnswer]) -> Vec<QuestionAnswer> {
    let Item::Questions { questions, .. } = item else {
        return Vec::new();
    };
    questions
        .iter()
        .filter_map(|asked| {
            answers
                .iter()
                .find(|answer| answer.question == asked.question)
                .cloned()
        })
        .collect()
}

/// The tool's input with the person's answers, as Claude Code reads them.
pub fn answered_input(input: &Value, answers: &[QuestionAnswer]) -> Value {
    let by_question: Map<String, Value> = answers
        .iter()
        .map(|answer| {
            (
                answer.question.clone(),
                Value::String(answer.answer.clone()),
            )
        })
        .collect();
    let mut updated = input.clone();
    if let Value::Object(fields) = &mut updated {
        fields.insert("answers".to_owned(), Value::Object(by_question));
    }
    updated
}

/// The same questions, answered or given up on.
pub fn with_answers(item: &Item, answers: Vec<QuestionAnswer>, state: QuestionState) -> Item {
    match item {
        Item::Questions {
            id,
            tool_call_id,
            questions,
            ..
        } => Item::Questions {
            id: id.clone(),
            tool_call_id: tool_call_id.clone(),
            questions: questions.clone(),
            answers,
            state,
        },
        other => other.clone(),
    }
}
