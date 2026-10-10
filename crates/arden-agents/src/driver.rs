//! The interface every agent implements (ADR 0017, ADR 0038).

use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::Receiver;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::model::{Choices, PermissionMode, QuestionAnswer, TurnEvent};

/// Whether the driver should carry on after an event, or stop because nobody is listening.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Stop,
}

/// The person's answer to an approval request (ADR 0039).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Answer {
    Allow,
    /// Allow, and remember the rule the agent suggested.
    AlwaysAllow,
    /// Refuse, and stop the reply.
    Deny,
}

/// Something the person does while a reply runs. The driver hears it at once, even while it waits
/// for its agent, as a real agent does during a long tool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Control {
    /// The person stopped the reply.
    Stop,
    /// The person answered the approval request that is the item with this id.
    Answer { item_id: String, answer: Answer },
    /// The person answered the questions that are the item with this id.
    Answers {
        item_id: String,
        answers: Vec<QuestionAnswer>,
    },
}

/// A message for an agent to answer, and the way the driver hears the person while it answers.
pub struct ReplyRequest<'a> {
    pub session_id: &'a str,
    pub turn_id: &'a str,
    /// What the person wrote.
    pub prompt: &'a str,
    /// The project's folder, where the agent works.
    pub folder: &'a Path,
    /// The agent's own conversation for the session, once it has answered in it, to carry on in.
    pub conversation: Option<&'a str>,
    /// The model and effort the session works with (ADR 0041).
    pub choices: Choices,
    /// How freely the agent may act before it asks (ADR 0044).
    pub permission_mode: PermissionMode,
    /// Remembers the agent's own conversation for the session, once it has answered in it.
    pub remember: &'a dyn Fn(&str),
    /// What the person does while the reply runs. It closes when the reply has ended.
    pub controls: Receiver<Control>,
}

/// What an agent says about a session outside the items of its replies (ADR 0044).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionChange {
    /// The permission mode the agent now applies, whoever changed it.
    PermissionMode(PermissionMode),
    /// The agent refused a permission mode, and kept the one it is in.
    PermissionModeRefused {
        kept: PermissionMode,
        /// The agent's own words, for the details.
        reason: String,
    },
}

/// Hears what an agent says about a session, by the session's id, from whichever thread hears it.
pub type SessionListener = Arc<dyn Fn(&str, SessionChange) + Send + Sync>;

/// An agent that answers messages. Claude implements this beside the Demo agent, and Codex will.
pub trait AgentDriver: Send + Sync {
    /// Answers the request's prompt, passing each event of the reply to `emit` as it happens. The
    /// reply ends with [`TurnEvent::Finished`] or [`TurnEvent::Failed`], unless `emit` says to stop
    /// or the person stops it.
    fn reply(&self, request: ReplyRequest<'_>, emit: &mut dyn FnMut(TurnEvent) -> Flow);

    /// Lets go of whatever the agent keeps running for a session, as when it is archived or
    /// deleted. Its conversation is kept, to carry on in.
    fn end(&self, _session_id: &str) {}
}
