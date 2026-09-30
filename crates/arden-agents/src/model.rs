//! What the sidebar and the session view show: projects, sessions, turns and their items.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Which agent answers in a session. Claude and Codex arrive with their drivers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AgentKind {
    /// The built-in demonstration agent.
    Demo,
}

/// What a project is. Only the Playground exists in the foundation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    /// The folder the app makes for itself, for Demo agent sessions.
    Playground,
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
}

/// One part of an agent's reply. Thinking, tool calls and file changes join text later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Item {
    /// Plain text, which grows while the reply streams.
    #[serde(rename_all = "camelCase")]
    Text { id: String, text: String },
}

impl Item {
    #[must_use]
    pub fn id(&self) -> &str {
        match self {
            Self::Text { id, .. } => id,
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

/// A conversation with one agent, in one project.
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
}

/// A project and its sessions, the newest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListing {
    pub project: Project,
    pub sessions: Vec<SessionSummary>,
}

/// What happens while a reply streams. The store applies these, and the UI receives them through a
/// channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TurnEvent {
    /// More text for an item. The first delta of an unknown item creates it.
    #[serde(rename_all = "camelCase")]
    TextDelta {
        turn_id: String,
        item_id: String,
        text: String,
    },
    /// The reply is complete.
    #[serde(rename_all = "camelCase")]
    Finished { turn_id: String },
    /// The reply stopped because something went wrong.
    #[serde(rename_all = "camelCase")]
    Failed { turn_id: String },
}
