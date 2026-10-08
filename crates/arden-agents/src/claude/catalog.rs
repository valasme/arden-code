//! What Claude Code says it can do: its slash commands and its models (ADR 0042). It sends both in
//! its answer to `initialize`, and the commands again, whole, each time they change. Only the
//! fields Arden Code shows are read; a field it does not know is skipped, so a newer Claude Code
//! keeps working.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::model::Effort;

/// An action Claude Code runs when a message starts with a slash and its name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    /// Without the slash. A plugin's commands are named `plugin:name`.
    pub name: String,
    pub description: String,
    /// What follows the name, such as `<low|medium|high>`. Empty when it takes nothing.
    pub argument_hint: String,
    /// Other names that run it.
    pub aliases: Vec<String>,
    /// Whether it is Claude Code's own, not a skill, a plugin's or an MCP server's.
    pub builtin: bool,
}

/// A model Claude Code can work with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    /// What `--model` takes: an alias such as `opus`, or a full id such as `claude-opus-4-8`.
    pub value: String,
    pub display_name: String,
    pub description: String,
    /// The full id an alias stands for.
    pub resolved_model: Option<String>,
    /// The efforts it takes, in order. None for a model that has no effort.
    pub efforts: Vec<Effort>,
}

/// The slash commands and models of the person's Claude Code, as it last said them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub commands: Vec<SlashCommand>,
    pub models: Vec<ModelOption>,
    /// The names of the commands that only make sense in a terminal, as Claude Code lists them.
    pub terminal_commands: Vec<String>,
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

fn effort(word: &str) -> Option<Effort> {
    Some(match word {
        "low" => Effort::Low,
        "medium" => Effort::Medium,
        "high" => Effort::High,
        "xhigh" => Effort::ExtraHigh,
        "max" => Effort::Max,
        _ => return None,
    })
}

/// The commands in a list Claude Code sent. Rows with no name are left out.
#[must_use]
pub fn commands_in(list: &Value) -> Vec<SlashCommand> {
    list.as_array()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| {
                    let name = text(&row["name"]);
                    (!name.is_empty()).then(|| SlashCommand {
                        name,
                        description: text(&row["description"]),
                        argument_hint: text(&row["argumentHint"]),
                        aliases: row["aliases"]
                            .as_array()
                            .map(|names| names.iter().map(text).collect())
                            .unwrap_or_default(),
                        builtin: row["builtin"].as_bool().unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The models in a list Claude Code sent. Rows with no value are left out.
#[must_use]
pub fn models_in(list: &Value) -> Vec<ModelOption> {
    list.as_array()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| {
                    let value = text(&row["value"]);
                    (!value.is_empty()).then(|| ModelOption {
                        display_name: match text(&row["displayName"]) {
                            name if name.is_empty() => value.clone(),
                            name => name,
                        },
                        description: text(&row["description"]),
                        resolved_model: row["resolvedModel"].as_str().map(str::to_owned),
                        efforts: if row["supportsEffort"].as_bool().unwrap_or(false) {
                            row["supportedEffortLevels"]
                                .as_array()
                                .map(|words| {
                                    words
                                        .iter()
                                        .filter_map(|word| word.as_str().and_then(effort))
                                        .collect()
                                })
                                .unwrap_or_default()
                        } else {
                            Vec::new()
                        },
                        value,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

impl Catalog {
    /// Reads the answer to `initialize`: its commands and models, each only when it holds a list.
    pub fn absorb_initialize(&mut self, answer: &Value) {
        if answer["commands"].is_array() {
            self.commands = commands_in(&answer["commands"]);
        }
        if answer["models"].is_array() {
            self.models = models_in(&answer["models"]);
        }
    }

    /// Replaces the commands with those of a `commands_changed` frame.
    pub fn replace_commands(&mut self, commands: Vec<SlashCommand>) {
        self.commands = commands;
    }

    /// Whether nothing is known yet.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.commands.is_empty() && self.models.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// The real Claude Code 2.1.286's answer to `initialize`, signed out, as recorded.
    fn recorded_answer() -> Value {
        let frame: Value = include_str!("fixtures/signed-out-2.1.286.ndjson")
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).expect("JSON"))
            .find(|frame| frame["type"] == "control_response")
            .expect("the answer to initialize");
        frame["response"]["response"].clone()
    }

    #[test]
    fn reads_the_commands_and_models_of_the_real_claude_codes_answer() {
        let mut catalog = Catalog::default();

        catalog.absorb_initialize(&recorded_answer());

        assert_eq!(catalog.commands.len(), 49);
        let review = catalog
            .commands
            .iter()
            .find(|command| command.name == "code-review")
            .expect("/code-review");
        assert_eq!(review.aliases, vec!["review".to_owned()]);
        assert!(review.builtin);
        assert!(review.argument_hint.contains("--fix"));
        assert_eq!(
            catalog
                .models
                .iter()
                .map(|model| model.value.as_str())
                .collect::<Vec<_>>(),
            ["default", "opus", "claude-fable-5-1[1m]", "sonnet", "haiku"]
        );
    }

    #[test]
    fn a_model_has_the_efforts_it_takes_and_none_when_it_takes_none() {
        let mut catalog = Catalog::default();
        catalog.absorb_initialize(&recorded_answer());
        let efforts = |value: &str| {
            catalog
                .models
                .iter()
                .find(|model| model.value == value)
                .map(|model| model.efforts.clone())
                .expect("the model")
        };

        assert_eq!(
            efforts("opus"),
            [
                Effort::Low,
                Effort::Medium,
                Effort::High,
                Effort::ExtraHigh,
                Effort::Max
            ]
        );
        assert_eq!(efforts("haiku"), Vec::<Effort>::new());
    }

    #[test]
    fn a_model_that_stands_for_another_says_which_and_one_without_a_name_is_shown_by_its_value() {
        let models = models_in(&json!([
            { "value": "opus", "resolvedModel": "claude-opus-5-5", "displayName": "Opus", "description": "d" },
            { "value": "claude-opus-4-6", "supportsEffort": true, "supportedEffortLevels": ["low", "high", "max", "extreme"] },
            { "displayName": "No value" }
        ]));

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].resolved_model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(models[1].display_name, "claude-opus-4-6");
        // A level this Arden Code does not know is left out, not guessed at.
        assert_eq!(models[1].efforts, [Effort::Low, Effort::High, Effort::Max]);
    }

    #[test]
    fn commands_changed_replaces_the_commands_whole_and_leaves_the_models() {
        let mut catalog = Catalog::default();
        catalog.absorb_initialize(&recorded_answer());

        catalog.replace_commands(commands_in(&json!([
            { "name": "mattpocock-skills:tdd", "description": "(mattpocock-skills) Test-driven development.", "argumentHint": "", "aliases": ["tdd"] }
        ])));

        assert_eq!(catalog.commands.len(), 1);
        assert_eq!(catalog.commands[0].aliases, vec!["tdd".to_owned()]);
        assert!(!catalog.commands[0].builtin);
        assert_eq!(catalog.models.len(), 5);
    }

    #[test]
    fn an_answer_with_no_lists_changes_nothing() {
        let mut catalog = Catalog::default();
        catalog.absorb_initialize(&recorded_answer());
        let known = catalog.clone();

        catalog.absorb_initialize(&json!({ "pid": 4242 }));
        catalog.absorb_initialize(&json!(null));

        assert_eq!(catalog, known);
        assert!(!catalog.is_empty());
        assert!(Catalog::default().is_empty());
    }
}
