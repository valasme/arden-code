//! Claude's context window (ADR 0044): Claude Code's answer to `get_context_usage`, asked with the
//! summary detail, which it answers from its own figures. A field that is missing or of another
//! shape gives no figure, so a change can only take the figure away, never stop a reply.

use serde_json::Value;

use crate::context_window::{ContextPart, ContextPartKind, ContextWindow};

/// The start of the id of every `get_context_usage` the driver sends, so that its answer is known.
pub const CONTEXT_REQUEST: &str = "arden-context-";

/// A count of tokens, when it is one.
fn count(value: &Value) -> Option<u32> {
    value.as_u64().and_then(|tokens| u32::try_from(tokens).ok())
}

fn part(reported: &Value) -> Option<ContextPart> {
    Some(ContextPart {
        name: reported["name"].as_str()?.to_owned(),
        tokens: count(&reported["tokens"])?,
        kind: match reported["kind"].as_str() {
            Some("used") => ContextPartKind::Used,
            Some("deferred") => ContextPartKind::Deferred,
            Some("buffer") => ContextPartKind::Buffer,
            Some("free") => ContextPartKind::Free,
            _ => ContextPartKind::Other,
        },
    })
}

/// The context window in Claude Code's answer to `get_context_usage`, or none for an error or an
/// answer without its figures.
#[must_use]
pub fn window_in(error: Option<&str>, answer: &Value) -> Option<ContextWindow> {
    if error.is_some() {
        return None;
    }
    let size = count(&answer["maxTokens"]).filter(|size| *size > 0)?;
    Some(ContextWindow {
        used: count(&answer["totalTokens"])?,
        size,
        percent: count(&answer["percentage"])?,
        compacts_at: if answer["isAutoCompactEnabled"] == false {
            None
        } else {
            count(&answer["autoCompactThreshold"])
        },
        parts: answer["categories"]
            .as_array()
            .map(|parts| parts.iter().filter_map(part).collect())
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// The real Claude Code 2.1.292's answer to `get_context_usage` with the summary detail, in a
    /// new conversation with nothing sent to the model.
    const ANSWER: &str = include_str!("fixtures/get-context-usage-2.1.292.json");

    fn recorded() -> Value {
        let frame: Value = serde_json::from_str(ANSWER).expect("the fixture is JSON");
        frame["response"]["response"].clone()
    }

    #[test]
    fn reads_the_window_claude_code_reports() {
        let window = window_in(None, &recorded()).expect("a context window");

        assert_eq!(window.used, 17_117);
        assert_eq!(window.size, 1_000_000);
        assert_eq!(window.percent, 2);
        assert_eq!(window.compacts_at, Some(967_000));
        let parts: Vec<_> = window
            .parts
            .iter()
            .map(|part| (part.name.as_str(), part.tokens, part.kind))
            .collect();
        assert_eq!(
            parts,
            [
                ("System prompt", 1911, ContextPartKind::Used),
                ("System tools", 13_203, ContextPartKind::Used),
                ("System tools (deferred)", 20_353, ContextPartKind::Deferred),
                ("Skills", 2003, ContextPartKind::Used),
                ("Autocompact buffer", 33_000, ContextPartKind::Buffer),
                ("Free space", 949_883, ContextPartKind::Free),
            ]
        );
    }

    #[test]
    fn an_error_gives_no_window() {
        assert_eq!(window_in(Some("Unknown subtype"), &recorded()), None);
    }

    #[test]
    fn an_answer_without_its_figures_gives_no_window() {
        assert_eq!(window_in(None, &json!({})), None);
        assert_eq!(
            window_in(
                None,
                &json!({ "totalTokens": 10, "maxTokens": 0, "percentage": 0 })
            ),
            None
        );
        assert_eq!(
            window_in(
                None,
                &json!({ "totalTokens": "many", "maxTokens": 200_000, "percentage": 1 })
            ),
            None
        );
    }

    #[test]
    fn a_claude_code_that_does_not_compact_has_no_compaction_point() {
        let mut answer = recorded();
        answer["isAutoCompactEnabled"] = json!(false);

        assert_eq!(
            window_in(None, &answer).map(|window| window.compacts_at),
            Some(None)
        );
    }

    #[test]
    fn keeps_a_part_of_a_kind_it_does_not_know_and_skips_one_it_cannot_read() {
        let answer = json!({
            "totalTokens": 50,
            "maxTokens": 200_000,
            "percentage": 0,
            "categories": [
                { "name": "Plugins", "tokens": 50, "kind": "plugins" },
                { "name": "Broken", "tokens": "fifty", "kind": "used" }
            ]
        });

        let window = window_in(None, &answer).expect("a context window");

        assert_eq!(
            window.parts,
            [ContextPart {
                name: "Plugins".into(),
                tokens: 50,
                kind: ContextPartKind::Other,
            }]
        );
        assert_eq!(window.compacts_at, None);
    }
}
