//! What Claude Code's frames become in the session (ADR 0039): text and thinking that stream, tool
//! calls that end with what the tool answered, and errors that say what to do. A reply ends with
//! Claude Code's result.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use arden_core::error::ErrorCode;

use serde_json::Value;

use super::protocol::{Block, Frame, StreamEvent, ToolResult};
use super::question;
use crate::model::{Item, ToolStatus, TurnEvent};

/// The most characters of a tool's input shown on its line.
const INPUT_LENGTH: usize = 200;
/// The most lines, and characters, of what a tool answered that are kept.
const OUTPUT_LINES: usize = 20;
const OUTPUT_LENGTH: usize = 2000;

/// Text cut to `limit` characters, with an ellipsis when it was longer.
pub(super) fn cut(text: &str, limit: usize) -> String {
    let mut characters = text.chars();
    let mut kept: String = characters.by_ref().take(limit).collect();
    if characters.next().is_some() {
        kept.push('…');
    }
    kept
}

/// A path as the person thinks of it: relative to the project when it is inside it.
pub(super) fn relative(path: &str, folder: &Path) -> String {
    let base = folder.display().to_string();
    let base = base.trim_end_matches(['\\', '/']);
    match path.get(..base.len()) {
        Some(start) if !base.is_empty() && start.eq_ignore_ascii_case(base) => {
            let rest = &path[base.len()..];
            if rest.is_empty() {
                ".".to_owned()
            } else if rest.starts_with(['\\', '/']) {
                rest.trim_start_matches(['\\', '/']).to_owned()
            } else {
                path.to_owned()
            }
        }
        _ => path.to_owned(),
    }
}

/// What a tool was asked to do, in a line: the command, the file, the pattern, the address.
fn summary(tool: &str, input: &Value, folder: &Path) -> String {
    let field = |name: &str| input[name].as_str().map(str::to_owned);
    let line = match tool {
        "Bash" | "PowerShell" => field("command"),
        "Read" | "Write" | "Edit" | "MultiEdit" => {
            field("file_path").map(|path| relative(&path, folder))
        }
        "NotebookEdit" => field("notebook_path").map(|path| relative(&path, folder)),
        "Glob" | "Grep" => field("pattern"),
        "WebFetch" => field("url"),
        "WebSearch" => field("query"),
        "Task" | "Agent" => field("description"),
        _ => None,
    }
    .unwrap_or_else(|| match input {
        Value::Object(fields) if fields.is_empty() => String::new(),
        Value::Null => String::new(),
        other => other.to_string(),
    });
    let first = line.lines().next().unwrap_or_default();
    let shown = if first.len() < line.trim_end().len() {
        format!("{first} …")
    } else {
        first.to_owned()
    };
    cut(&shown, INPUT_LENGTH)
}

/// What a tool answered, kept short enough to read under its line.
fn output_of(result: &ToolResult) -> String {
    let lines: Vec<&str> = result.text.trim_end().lines().collect();
    let mut kept = lines
        .iter()
        .take(OUTPUT_LINES)
        .copied()
        .collect::<Vec<_>>()
        .join("\n");
    if lines.len() > OUTPUT_LINES {
        kept.push_str("\n…");
    }
    cut(&kept, OUTPUT_LENGTH)
}

/// The reply to one message, as its frames arrive.
pub struct Reply {
    turn_id: String,
    folder: PathBuf,
    /// The message that is streaming.
    message: String,
    /// The item each streamed block became, by message and position.
    streamed: HashMap<(String, u64), String>,
    /// How many blocks of each message have arrived complete.
    delivered: HashMap<String, u64>,
    /// The item of each tool call, by Claude's id for it.
    tools: HashMap<String, String>,
    /// Whether an error is shown already, so the result does not show a second one.
    failed: bool,
    ended: bool,
}

/// The code for an error Claude Code reports with a message.
fn code_for(kind: &str) -> ErrorCode {
    if kind == "authentication_failed" {
        ErrorCode::ClaudeSignedOut
    } else {
        ErrorCode::ClaudeCouldNotAnswer
    }
}

impl Reply {
    pub fn new(turn_id: &str, folder: &Path) -> Self {
        Self {
            turn_id: turn_id.to_owned(),
            folder: folder.to_path_buf(),
            message: String::new(),
            streamed: HashMap::new(),
            delivered: HashMap::new(),
            tools: HashMap::new(),
            failed: false,
            ended: false,
        }
    }

    /// Whether Claude Code said the reply is over.
    pub fn ended(&self) -> bool {
        self.ended
    }

    fn added(&self, item: Item) -> TurnEvent {
        TurnEvent::ItemAdded {
            turn_id: self.turn_id.clone(),
            item,
        }
    }

    fn block_id(&self, message: &str, index: u64) -> String {
        format!("{}-{message}-{index}", self.turn_id)
    }

    /// The item of a tool call, the same however often it is seen.
    fn tool_item(&mut self, tool_use_id: &str) -> String {
        let id = format!("{}-{tool_use_id}", self.turn_id);
        self.tools.insert(tool_use_id.to_owned(), id.clone());
        id
    }

    fn tool_call(&self, id: String, name: &str, input: String) -> TurnEvent {
        self.added(Item::ToolCall {
            id,
            name: name.to_owned(),
            input,
            status: ToolStatus::Running,
            output: None,
        })
    }

    fn error(&mut self, message: String, code: ErrorCode) -> TurnEvent {
        self.failed = true;
        self.added(Item::Error {
            id: format!("{}-error", self.turn_id),
            message,
            code: Some(code),
        })
    }

    fn on_stream(&mut self, event: &StreamEvent) -> Vec<TurnEvent> {
        match event {
            StreamEvent::MessageStart { message_id } => {
                self.message.clone_from(message_id);
                Vec::new()
            }
            StreamEvent::BlockStart { index, block } => {
                let id = self.block_id(&self.message, *index);
                let item = match block {
                    Block::Text(text) => Item::Text {
                        id: id.clone(),
                        text: text.clone(),
                    },
                    Block::Thinking(text) => Item::Thinking {
                        id: id.clone(),
                        text: text.clone(),
                    },
                    Block::ToolUse { name, .. } if name == question::TOOL => return Vec::new(),
                    Block::ToolUse {
                        id: tool_use_id,
                        name,
                        ..
                    } => {
                        let item_id = self.tool_item(tool_use_id);
                        self.streamed
                            .insert((self.message.clone(), *index), item_id.clone());
                        return vec![self.tool_call(item_id, name, String::new())];
                    }
                    Block::Other => return Vec::new(),
                };
                self.streamed.insert((self.message.clone(), *index), id);
                vec![self.added(item)]
            }
            StreamEvent::TextDelta { index, text } | StreamEvent::ThinkingDelta { index, text } => {
                self.streamed
                    .get(&(self.message.clone(), *index))
                    .map(|item_id| TurnEvent::TextDelta {
                        turn_id: self.turn_id.clone(),
                        item_id: item_id.clone(),
                        text: text.clone(),
                    })
                    .into_iter()
                    .collect()
            }
            StreamEvent::Other => Vec::new(),
        }
    }

    /// A complete message, or some of its blocks: each settles the item it streamed into, or
    /// makes it when nothing streamed.
    fn on_assistant(
        &mut self,
        message_id: &str,
        blocks: &[Block],
        error: Option<&str>,
    ) -> Vec<TurnEvent> {
        if let Some(kind) = error {
            let said: Vec<&str> = blocks
                .iter()
                .filter_map(|block| match block {
                    Block::Text(text) => Some(text.as_str()),
                    _ => None,
                })
                .collect();
            return vec![self.error(said.join("\n"), code_for(kind))];
        }
        let mut events = Vec::new();
        for block in blocks {
            let delivered = self.delivered.entry(message_id.to_owned()).or_default();
            let index = *delivered;
            *delivered += 1;
            let streamed = self.streamed.get(&(message_id.to_owned(), index)).cloned();
            let id = streamed
                .clone()
                .unwrap_or_else(|| self.block_id(message_id, index));
            let item = match block {
                Block::Text(text) if streamed.is_some() || !text.is_empty() => Item::Text {
                    id,
                    text: text.clone(),
                },
                Block::Thinking(text) if streamed.is_some() || !text.is_empty() => Item::Thinking {
                    id,
                    text: text.clone(),
                },
                Block::ToolUse { name, .. } if name == question::TOOL => continue,
                Block::ToolUse {
                    id: tool_use_id,
                    name,
                    input,
                } => {
                    let item_id = self.tool_item(tool_use_id);
                    let line = summary(name, input, &self.folder);
                    events.push(self.tool_call(item_id, name, line));
                    continue;
                }
                _ => continue,
            };
            events.push(self.added(item));
        }
        events
    }

    /// What a frame changes in the reply.
    pub fn on(&mut self, frame: &Frame) -> Vec<TurnEvent> {
        match frame {
            Frame::Stream {
                event,
                subagent: false,
            } => self.on_stream(event),
            Frame::Assistant {
                message_id,
                blocks,
                error,
                subagent: false,
            } => self.on_assistant(message_id, blocks, error.as_deref()),
            Frame::ToolResults {
                results,
                subagent: false,
                ..
            } => results
                .iter()
                .filter_map(|result| {
                    let item_id = self.tools.get(&result.tool_use_id)?;
                    Some(TurnEvent::ToolCallEnded {
                        turn_id: self.turn_id.clone(),
                        item_id: item_id.clone(),
                        status: if result.is_error {
                            ToolStatus::Failed
                        } else {
                            ToolStatus::Done
                        },
                        output: Some(output_of(result)),
                    })
                })
                .collect(),
            Frame::Result { is_error, text } => {
                self.ended = true;
                let turn_id = self.turn_id.clone();
                if !*is_error {
                    return vec![TurnEvent::Finished { turn_id }];
                }
                let mut events = Vec::new();
                if !self.failed {
                    events.push(self.error(
                        text.clone().unwrap_or_default(),
                        ErrorCode::ClaudeCouldNotAnswer,
                    ));
                }
                events.push(TurnEvent::Failed { turn_id });
                events
            }
            _ => Vec::new(),
        }
    }
}
