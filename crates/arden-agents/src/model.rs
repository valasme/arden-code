//! What the sidebar and the session view show: projects, sessions, turns and their items.

use arden_core::error::ErrorCode;
use serde::{Deserialize, Serialize};
use specta::Type;

/// Which agent answers in a session. Codex arrives with its driver.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AgentKind {
    /// The built-in demonstration agent.
    Demo,
    /// Claude, through the person's own Claude Code (ADR 0038).
    Claude,
}

/// What a project is. Only the Playground exists in the foundation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    /// The folder the app makes for itself, for Demo agent sessions.
    Playground,
    /// A folder the person opened, for example with the `arden-code` command.
    Folder,
}

/// A folder on disk where agents work.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub kind: ProjectKind,
    /// The folder's name.
    pub name: String,
    /// The folder's full path.
    pub path: String,
    /// Whether the person trusts the folder, so Claude may work in it (ADR 0039): Claude Code runs
    /// a project's own hooks, MCP servers and environment. The Playground is always trusted.
    pub trusted: bool,
}

/// How a tool call ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ToolStatus {
    /// The agent is still using the tool.
    Running,
    Done,
    Failed,
    /// The person stopped the reply while the tool was running.
    Stopped,
}

/// What happened to a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeKind {
    Created,
    Modified,
    Deleted,
}

/// A moment in a reply that is not text, shown as a line of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum StatusKind {
    /// The agent started working on the message.
    Started,
    /// The person stopped the reply.
    Stopped,
    /// The agent could not find the session's earlier conversation, so the reply starts a new one.
    NewConversation,
}

/// What an agent asks permission to do, in Arden Code's words (ADR 0039).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalAction {
    RunCommand,
    EditFile,
    CreateFile,
    OpenPage,
    SearchWeb,
    /// Any other tool, such as one of an MCP server.
    UseTool,
}

/// Where an approval request stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalState {
    /// The agent waits for the person's answer.
    Waiting,
    Allowed,
    /// Allowed, with the rule the agent suggested, so it is not asked again.
    AlwaysAllowed,
    /// Refused; the reply stopped with it.
    Denied,
    /// No answer is needed any more: the reply stopped, or the agent gave up on asking.
    Cancelled,
}

/// One choice a question offers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    /// What choosing it means, when the agent said.
    pub description: Option<String>,
}

/// Something the agent asks the person to choose (ADR 0039).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    /// A word or two that names the question, such as "Library".
    pub header: String,
    pub question: String,
    pub options: Vec<QuestionOption>,
    /// Whether several options may be chosen.
    pub multi_select: bool,
}

/// The person's answer to one question: the options chosen, or words of their own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAnswer {
    /// The question's text, which the answer goes back to the agent under.
    pub question: String,
    pub answer: String,
}

/// Where the agent's questions stand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum QuestionState {
    /// The agent waits for the person's answers.
    Waiting,
    Answered,
    /// No answer is needed any more: the reply stopped, or the agent gave up on asking.
    Cancelled,
}

/// One part of an agent's reply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Item {
    /// What the agent says, in Markdown. It grows while the reply streams.
    #[serde(rename_all = "camelCase")]
    Text { id: String, text: String },
    /// The agent's reasoning. It grows while the reply streams.
    #[serde(rename_all = "camelCase")]
    Thinking { id: String, text: String },
    /// The agent using a tool, such as reading a file or running a command.
    #[serde(rename_all = "camelCase")]
    ToolCall {
        id: String,
        /// The tool's name, such as `read_file`.
        name: String,
        /// What the tool was asked to do, in a line.
        input: String,
        status: ToolStatus,
        /// What the tool answered, once it has.
        output: Option<String>,
    },
    /// A file the agent created, changed or deleted.
    #[serde(rename_all = "camelCase")]
    FileChange {
        id: String,
        /// The file's path, relative to the project.
        path: String,
        change: FileChangeKind,
        added: u32,
        removed: u32,
    },
    /// Something that went wrong: reported by the agent, or found by Arden Code, which then gives
    /// the error's code so the person is told what to do.
    #[serde(rename_all = "camelCase")]
    Error {
        id: String,
        /// What the agent said, or Arden Code's details for the logs.
        message: String,
        /// Arden Code's code for the error, when it is one Arden Code knows. Items saved before
        /// codes existed have none.
        #[serde(default)]
        code: Option<ErrorCode>,
    },
    /// A marker between the parts of a reply.
    #[serde(rename_all = "camelCase")]
    Status { id: String, kind: StatusKind },
    /// The agent asks the person to allow or deny an action (ADR 0039).
    #[serde(rename_all = "camelCase")]
    Approval {
        id: String,
        /// The tool call it is about, when it has one.
        tool_call_id: Option<String>,
        action: ApprovalAction,
        /// The command, the file, the address or the tool, in a line.
        subject: String,
        /// More to decide by: a command's description, the change to a file, a tool's input.
        detail: Option<String>,
        /// The rule the agent suggests remembering, in a line. Always allow is offered with it.
        rule: Option<String>,
        state: ApprovalState,
    },
    /// The agent asks the person to choose (ADR 0039).
    #[serde(rename_all = "camelCase")]
    Questions {
        id: String,
        /// The tool call that asks them, when it has one.
        tool_call_id: Option<String>,
        questions: Vec<Question>,
        /// The person's answers, once given.
        answers: Vec<QuestionAnswer>,
        state: QuestionState,
    },
}

impl Item {
    /// Whether it is an approval request or questions that wait for the person (ADR 0039).
    #[must_use]
    pub fn waits_for_answer(&self) -> bool {
        matches!(
            self,
            Self::Approval {
                state: ApprovalState::Waiting,
                ..
            } | Self::Questions {
                state: QuestionState::Waiting,
                ..
            }
        )
    }

    #[must_use]
    pub fn id(&self) -> &str {
        match self {
            Self::Text { id, .. }
            | Self::Thinking { id, .. }
            | Self::ToolCall { id, .. }
            | Self::FileChange { id, .. }
            | Self::Error { id, .. }
            | Self::Status { id, .. }
            | Self::Approval { id, .. }
            | Self::Questions { id, .. } => id,
        }
    }
}

/// How far a turn has come.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TurnStatus {
    /// The agent is still replying.
    Running,
    Done,
    /// The reply stopped because something went wrong.
    Failed,
    /// The person stopped the reply.
    Stopped,
}

/// The person's message and the agent's reply to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub id: String,
    /// What the person wrote.
    pub prompt: String,
    /// When the message was sent, in UTC, as `2026-09-30T14:05:09Z`.
    pub started_at: String,
    pub status: TurnStatus,
    pub items: Vec<Item>,
}

impl Turn {
    /// Ends the turn as stopped by the person: what was still under way ends with it (see
    /// [`Turn::settle`]), and a marker records it.
    fn stop(&mut self) {
        self.status = TurnStatus::Stopped;
        self.settle();
        let marker = format!("{}-stopped", self.id);
        if !self.items.iter().any(|item| item.id() == marker) {
            self.items.push(Item::Status {
                id: marker,
                kind: StatusKind::Stopped,
            });
        }
    }

    /// Settles what was still under way in a turn that is over: a tool that was running stopped
    /// with it, and an approval request or questions that still waited need no answer any more.
    pub fn settle(&mut self) {
        for item in &mut self.items {
            match item {
                Item::ToolCall { status, .. } if *status == ToolStatus::Running => {
                    *status = ToolStatus::Stopped;
                }
                Item::Approval { state, .. } if *state == ApprovalState::Waiting => {
                    *state = ApprovalState::Cancelled;
                }
                Item::Questions { state, .. } if *state == QuestionState::Waiting => {
                    *state = QuestionState::Cancelled;
                }
                _ => {}
            }
        }
    }

    /// Records one event of the reply. An event for another turn changes nothing.
    pub fn apply(&mut self, event: &TurnEvent) {
        if event.turn_id() != self.id {
            return;
        }
        match event {
            TurnEvent::ItemAdded { item, .. } => {
                match self.items.iter_mut().find(|known| known.id() == item.id()) {
                    Some(known) => *known = item.clone(),
                    None => self.items.push(item.clone()),
                }
            }
            TurnEvent::TextDelta { item_id, text, .. } => {
                match self.items.iter_mut().find(|item| item.id() == item_id) {
                    Some(Item::Text { text: whole, .. } | Item::Thinking { text: whole, .. }) => {
                        whole.push_str(text);
                    }
                    Some(_) => {}
                    None => self.items.push(Item::Text {
                        id: item_id.clone(),
                        text: text.clone(),
                    }),
                }
            }
            TurnEvent::ToolCallEnded {
                item_id,
                status,
                output: result,
                ..
            } => {
                if let Some(Item::ToolCall {
                    status: current,
                    output,
                    ..
                }) = self.items.iter_mut().find(|item| item.id() == item_id)
                {
                    *current = *status;
                    output.clone_from(result);
                }
            }
            TurnEvent::Finished { .. } => self.status = TurnStatus::Done,
            TurnEvent::Failed { .. } => self.status = TurnStatus::Failed,
            TurnEvent::Stopped { .. } => self.stop(),
        }
    }
}

/// A session: the turns with one agent, in one project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub agent: AgentKind,
    /// The first message, shortened, or nothing until there is one.
    pub title: Option<String>,
    /// When the session was created, in UTC.
    pub created_at: String,
    /// When a message was last sent in it, or when it was created if none was, in UTC.
    pub updated_at: String,
    /// Whether it is pinned to the top of the sidebar (ADR 0036).
    pub pinned: bool,
    /// When it was archived, in UTC, while it is (ADR 0036). An archived session is read-only.
    pub archived_at: Option<String>,
    /// The session it was started from, while that one exists: a linked session (ADR 0036).
    pub linked_from: Option<String>,
    pub turns: Vec<Turn>,
}

/// A session as the sidebar lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub project_id: String,
    pub agent: AgentKind,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pinned: bool,
    pub archived_at: Option<String>,
    pub linked_from: Option<String>,
}

/// A project and its sessions, the most recently used first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListing {
    pub project: Project,
    pub sessions: Vec<SessionSummary>,
}

/// The sessions as the sidebar lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionList {
    /// The pinned sessions, whatever their project, in the order they were pinned.
    pub pinned: Vec<SessionSummary>,
    /// Every project, the Playground first and the others in the order they were opened, each with
    /// its sessions that are neither pinned nor archived.
    pub projects: Vec<ProjectListing>,
    /// The archived sessions, whatever their project, the last archived first.
    pub archived: Vec<SessionSummary>,
}

/// What happens while a reply streams. The store applies these, and the UI receives them through a
/// channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TurnEvent {
    /// A new part of the reply, with whatever it holds so far.
    #[serde(rename_all = "camelCase")]
    ItemAdded { turn_id: String, item: Item },
    /// More text for a text or thinking item. The first delta of an unknown item creates a text item.
    #[serde(rename_all = "camelCase")]
    TextDelta {
        turn_id: String,
        item_id: String,
        text: String,
    },
    /// A tool call ended, with what the tool answered.
    #[serde(rename_all = "camelCase")]
    ToolCallEnded {
        turn_id: String,
        item_id: String,
        status: ToolStatus,
        output: Option<String>,
    },
    /// The reply is complete.
    #[serde(rename_all = "camelCase")]
    Finished { turn_id: String },
    /// The reply stopped because something went wrong.
    #[serde(rename_all = "camelCase")]
    Failed { turn_id: String },
    /// The person stopped the reply.
    #[serde(rename_all = "camelCase")]
    Stopped { turn_id: String },
}

impl TurnEvent {
    /// The turn the event is about.
    #[must_use]
    pub fn turn_id(&self) -> &str {
        match self {
            Self::ItemAdded { turn_id, .. }
            | Self::TextDelta { turn_id, .. }
            | Self::ToolCallEnded { turn_id, .. }
            | Self::Finished { turn_id }
            | Self::Failed { turn_id }
            | Self::Stopped { turn_id } => turn_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turn() -> Turn {
        Turn {
            id: "turn-1".into(),
            prompt: "hi".into(),
            started_at: String::new(),
            status: TurnStatus::Running,
            items: Vec::new(),
        }
    }

    fn thinking() -> Item {
        Item::Thinking {
            id: "t".into(),
            text: String::new(),
        }
    }

    #[test]
    fn text_deltas_grow_a_thinking_item_too() {
        let mut turn = turn();
        turn.apply(&TurnEvent::ItemAdded {
            turn_id: "turn-1".into(),
            item: thinking(),
        });

        for piece in ["Let ", "me ", "see."] {
            turn.apply(&TurnEvent::TextDelta {
                turn_id: "turn-1".into(),
                item_id: "t".into(),
                text: piece.into(),
            });
        }

        assert_eq!(
            turn.items,
            vec![Item::Thinking {
                id: "t".into(),
                text: "Let me see.".into()
            }]
        );
    }

    #[test]
    fn adding_an_item_again_replaces_it() {
        let mut turn = turn();
        let added = |text: &str| TurnEvent::ItemAdded {
            turn_id: "turn-1".into(),
            item: Item::Error {
                id: "e".into(),
                message: text.into(),
                code: None,
            },
        };

        turn.apply(&added("first"));
        turn.apply(&added("second"));

        assert_eq!(turn.items.len(), 1);
        assert!(matches!(&turn.items[0], Item::Error { message, .. } if message == "second"));
    }

    #[test]
    fn a_tool_call_that_ends_takes_its_status_and_output() {
        let mut turn = turn();
        turn.apply(&TurnEvent::ItemAdded {
            turn_id: "turn-1".into(),
            item: Item::ToolCall {
                id: "c".into(),
                name: "read_file".into(),
                input: "a.txt".into(),
                status: ToolStatus::Running,
                output: None,
            },
        });

        turn.apply(&TurnEvent::ToolCallEnded {
            turn_id: "turn-1".into(),
            item_id: "c".into(),
            status: ToolStatus::Done,
            output: Some("3 lines".into()),
        });

        assert!(matches!(
            &turn.items[0],
            Item::ToolCall { status: ToolStatus::Done, output: Some(text), .. } if text == "3 lines"
        ));
    }

    #[test]
    fn an_error_of_arden_codes_own_carries_its_code_and_one_saved_before_codes_reads_without() {
        let coded = Item::Error {
            id: "e".into(),
            message: "Not logged in".into(),
            code: Some(ErrorCode::ClaudeSignedOut),
        };
        let saved = serde_json::to_value(&coded).expect("JSON");
        assert_eq!(saved["code"], "ARD-AGT-009");

        let older: Item = serde_json::from_str(r#"{"type":"error","id":"e","message":"It broke"}"#)
            .expect("an item saved before error codes");
        assert_eq!(
            older,
            Item::Error {
                id: "e".into(),
                message: "It broke".into(),
                code: None
            }
        );
    }

    #[test]
    fn events_for_another_turn_or_an_item_that_is_not_there_change_nothing() {
        let mut turn = turn();

        turn.apply(&TurnEvent::Finished {
            turn_id: "turn-9".into(),
        });
        turn.apply(&TurnEvent::ToolCallEnded {
            turn_id: "turn-1".into(),
            item_id: "nothing".into(),
            status: ToolStatus::Failed,
            output: None,
        });

        assert_eq!(turn.status, TurnStatus::Running);
        assert!(turn.items.is_empty());
    }
}
