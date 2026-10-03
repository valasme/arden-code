//! The Demo agent: a clearly labeled stand-in that streams a reply through the real pipeline.
//!
//! Its reply shows every kind of item: a status marker, thinking, tool calls that end well and
//! badly, Markdown text with code and a table, and file changes. A message that mentions an error
//! makes the reply end with one.

use std::time::Duration;

use crate::driver::{AgentDriver, Flow, ReplyRequest};
use crate::model::{FileChangeKind, Item, StatusKind, ToolStatus, TurnEvent};

/// How long the Demo agent waits between two words, so a person can watch it stream.
const WORD_PACE: Duration = Duration::from_millis(20);
/// How long a tool call takes.
const TOOL_PACE: Duration = Duration::from_millis(400);

/// Streams a scripted reply. It says what it is, and repeats what it was asked.
#[derive(Debug, Clone, Copy)]
pub struct DemoDriver {
    word_pace: Duration,
    tool_pace: Duration,
}

impl DemoDriver {
    /// The Demo agent at the speed people read at.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            word_pace: WORD_PACE,
            tool_pace: TOOL_PACE,
        }
    }

    /// A Demo agent that does not wait, for tests.
    #[must_use]
    pub const fn instant() -> Self {
        Self {
            word_pace: Duration::ZERO,
            tool_pace: Duration::ZERO,
        }
    }
}

impl Default for DemoDriver {
    fn default() -> Self {
        Self::new()
    }
}

const THINKING: &str = "The person wrote a message. I am the Demo agent, so I will not do any real work. I will show what a reply can hold: some reasoning, tool calls, text with formatting, and file changes.";

/// What the Demo agent says, in Markdown.
fn reply_text(prompt: &str) -> String {
    let quoted: String = prompt
        .trim()
        .lines()
        .map(|line| format!("> {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "This is the **Demo agent**. Real agents are coming.\n\nYou wrote:\n\n{quoted}\n\n## What a reply can show\n\n- Text with *emphasis*, `inline code` and [links](https://github.com/valasme/arden-code)\n- Code, highlighted, with a copy button\n- Tables and lists\n\n```ts\nfunction greet(name: string): string {{\n  return `Hello, ${{name}}!`;\n}}\n```\n\n| Item | Shown as |\n| --- | --- |\n| Thinking | A folded note |\n| Tool call | A card |\n| File change | A card with counts |\n\nThis reply streams word by word from Rust, through a channel, into the session view. [Write to the team](mailto:hello@example.com) shows how an unusual link asks first."
    )
}

/// What the script does, one step at a time.
struct Run<'a> {
    driver: &'a DemoDriver,
    turn_id: &'a str,
    emit: &'a mut dyn FnMut(TurnEvent) -> Flow,
}

impl Run<'_> {
    fn send(&mut self, event: TurnEvent) -> Flow {
        (self.emit)(event)
    }

    fn add(&mut self, item: Item) -> Flow {
        let event = TurnEvent::ItemAdded {
            turn_id: self.turn_id.to_owned(),
            item,
        };
        self.send(event)
    }

    fn pause(pace: Duration) {
        if !pace.is_zero() {
            std::thread::sleep(pace);
        }
    }

    /// Streams text into an item that was added empty, word by word.
    fn stream(&mut self, item_id: &str, text: &str) -> Flow {
        for word in text.split_inclusive(char::is_whitespace) {
            let event = TurnEvent::TextDelta {
                turn_id: self.turn_id.to_owned(),
                item_id: item_id.to_owned(),
                text: word.to_owned(),
            };
            if self.send(event) == Flow::Stop {
                return Flow::Stop;
            }
            Self::pause(self.driver.word_pace);
        }
        Flow::Continue
    }

    /// A tool call that runs for a moment and ends as told.
    fn tool(&mut self, name: &str, input: &str, status: ToolStatus, output: &str) -> Flow {
        let id = format!("{}-{name}", self.turn_id);
        let started = self.add(Item::ToolCall {
            id: id.clone(),
            name: name.to_owned(),
            input: input.to_owned(),
            status: ToolStatus::Running,
            output: None,
        });
        if started == Flow::Stop {
            return Flow::Stop;
        }
        Self::pause(self.driver.tool_pace);
        let event = TurnEvent::ToolCallEnded {
            turn_id: self.turn_id.to_owned(),
            item_id: id,
            status,
            output: Some(output.to_owned()),
        };
        self.send(event)
    }

    fn file(&mut self, path: &str, change: FileChangeKind, added: u32, removed: u32) -> Flow {
        self.add(Item::FileChange {
            id: format!("{}-file-{path}", self.turn_id),
            path: path.to_owned(),
            change,
            added,
            removed,
        })
    }
}

/// Runs the script, stopping as soon as a step says nobody is listening.
fn run(run: &mut Run<'_>, prompt: &str) -> Flow {
    let turn_id = run.turn_id;
    let id = |part: &str| format!("{turn_id}-{part}");

    macro_rules! step {
        ($flow:expr) => {
            if $flow == Flow::Stop {
                return Flow::Stop;
            }
        };
    }

    step!(run.add(Item::Status {
        id: id("status"),
        kind: StatusKind::Started,
    }));
    let thinking = id("thinking");
    step!(run.add(Item::Thinking {
        id: thinking.clone(),
        text: String::new(),
    }));
    step!(run.stream(&thinking, THINKING));
    step!(run.tool("read_file", "README.md", ToolStatus::Done, "42 lines"));
    step!(run.tool(
        "run_command",
        "cargo test",
        ToolStatus::Failed,
        "The Demo agent does not run anything. This failure is part of the show.",
    ));
    let text = id("text");
    step!(run.stream(&text, &reply_text(prompt)));
    step!(run.file("notes/demo.md", FileChangeKind::Created, 12, 0));
    step!(run.file("src/main.ts", FileChangeKind::Modified, 3, 1));
    step!(run.file("old/notes.txt", FileChangeKind::Deleted, 0, 8));
    Flow::Continue
}

impl AgentDriver for DemoDriver {
    fn reply(&self, request: ReplyRequest<'_>, emit: &mut dyn FnMut(TurnEvent) -> Flow) {
        let (turn_id, prompt) = (request.turn_id, request.prompt);
        let mut script = Run {
            driver: self,
            turn_id,
            emit,
        };
        if run(&mut script, prompt) == Flow::Stop {
            return;
        }
        if prompt.to_lowercase().contains("error") {
            let added = script.add(Item::Error {
                id: format!("{turn_id}-error"),
                message: "You asked for an error, so the Demo agent ended with one.".to_owned(),
                code: None,
            });
            if added == Flow::Stop {
                return;
            }
            script.send(TurnEvent::Failed {
                turn_id: turn_id.to_owned(),
            });
            return;
        }
        script.send(TurnEvent::Finished {
            turn_id: turn_id.to_owned(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Turn, TurnStatus};

    /// A request for the Demo agent, as the store makes one.
    fn request(prompt: &str) -> ReplyRequest<'_> {
        let (_person, controls) = std::sync::mpsc::channel();
        ReplyRequest {
            session_id: "session-1",
            turn_id: "turn-1",
            prompt,
            folder: std::path::Path::new(r"C:Playground"),
            controls,
        }
    }

    fn events_of(prompt: &str) -> Vec<TurnEvent> {
        let mut events = Vec::new();
        DemoDriver::instant().reply(request(prompt), &mut |event| {
            events.push(event);
            Flow::Continue
        });
        events
    }

    /// What the events add up to, the way the session records them.
    fn turn_after(events: &[TurnEvent]) -> Turn {
        let mut turn = Turn {
            id: "turn-1".into(),
            prompt: "hello".into(),
            started_at: String::new(),
            status: TurnStatus::Running,
            items: Vec::new(),
        };
        for event in events {
            turn.apply(event);
        }
        turn
    }

    fn kinds(turn: &Turn) -> Vec<&'static str> {
        turn.items
            .iter()
            .map(|item| match item {
                Item::Text { .. } => "text",
                Item::Thinking { .. } => "thinking",
                Item::ToolCall { .. } => "tool",
                Item::FileChange { .. } => "file",
                Item::Error { .. } => "error",
                Item::Approval { .. } => "approval",
                Item::Questions { .. } => "questions",
                Item::Status { .. } => "status",
            })
            .collect()
    }

    #[test]
    fn a_reply_shows_every_kind_of_item_in_a_natural_order() {
        let turn = turn_after(&events_of("hello"));

        assert_eq!(turn.status, TurnStatus::Done);
        assert_eq!(
            kinds(&turn),
            vec![
                "status", "thinking", "tool", "tool", "text", "file", "file", "file"
            ]
        );
    }

    #[test]
    fn one_tool_call_ends_well_and_one_ends_badly() {
        let turn = turn_after(&events_of("hello"));

        let statuses: Vec<ToolStatus> = turn
            .items
            .iter()
            .filter_map(|item| match item {
                Item::ToolCall { status, .. } => Some(*status),
                _ => None,
            })
            .collect();
        assert_eq!(statuses, vec![ToolStatus::Done, ToolStatus::Failed]);
        assert!(turn.items.iter().any(|item| matches!(
            item,
            Item::ToolCall { output: Some(text), .. } if !text.is_empty()
        )));
    }

    #[test]
    fn tool_calls_are_announced_running_before_they_end() {
        let events = events_of("hello");

        let started = events.iter().position(|event| {
            matches!(
                event,
                TurnEvent::ItemAdded {
                    item: Item::ToolCall {
                        status: ToolStatus::Running,
                        ..
                    },
                    ..
                }
            )
        });
        let ended = events
            .iter()
            .position(|event| matches!(event, TurnEvent::ToolCallEnded { .. }));
        assert!(started.is_some());
        assert!(started < ended);
    }

    #[test]
    fn the_text_repeats_the_message_and_streams_in_many_pieces() {
        let events = events_of("hello there");

        let pieces = events
            .iter()
            .filter(|event| {
                matches!(event, TurnEvent::TextDelta { item_id, .. } if item_id.ends_with("-text"))
            })
            .count();
        assert!(pieces > 20, "a reply streams in many pieces");
        let turn = turn_after(&events);
        let Some(Item::Text { text, .. }) = turn
            .items
            .iter()
            .find(|item| matches!(item, Item::Text { .. }))
        else {
            panic!("the reply has text");
        };
        assert!(text.starts_with("This is the **Demo agent**."));
        assert!(text.contains("> hello there"));
        assert!(text.contains("```ts"), "a code block to highlight");
    }

    #[test]
    fn a_message_about_an_error_ends_with_one() {
        let turn = turn_after(&events_of("please show me an Error"));

        assert_eq!(turn.status, TurnStatus::Failed);
        assert_eq!(kinds(&turn).last(), Some(&"error"));
    }

    #[test]
    fn stops_when_nobody_is_listening_any_more() {
        for stop_at in [1, 2, 5, 40] {
            let mut seen = 0;
            let mut last = None;
            DemoDriver::instant().reply(request("hi"), &mut |event| {
                seen += 1;
                last = Some(event);
                if seen == stop_at {
                    Flow::Stop
                } else {
                    Flow::Continue
                }
            });

            assert_eq!(seen, stop_at, "stopped at {stop_at}");
            assert!(!matches!(last, Some(TurnEvent::Finished { .. })));
        }
    }
}
