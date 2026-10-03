//! The interface every agent implements (ADR 0017, ADR 0038).

use std::path::Path;
use std::sync::mpsc::Receiver;

use crate::model::TurnEvent;

/// Whether the driver should carry on after an event, or stop because nobody is listening.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Stop,
}

/// Something the person does while a reply runs. The driver hears it at once, even while it waits
/// for its agent, as a real agent does during a long tool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Control {
    /// The person stopped the reply.
    Stop,
}

/// A message for an agent to answer, and the way the driver hears the person while it answers.
pub struct ReplyRequest<'a> {
    pub session_id: &'a str,
    pub turn_id: &'a str,
    /// What the person wrote.
    pub prompt: &'a str,
    /// The project's folder, where the agent works.
    pub folder: &'a Path,
    /// What the person does while the reply runs. It closes when the reply has ended.
    pub controls: Receiver<Control>,
}

/// An agent that answers messages. Claude implements this beside the Demo agent, and Codex will.
pub trait AgentDriver: Send + Sync {
    /// Answers the request's prompt, passing each event of the reply to `emit` as it happens. The
    /// reply ends with [`TurnEvent::Finished`] or [`TurnEvent::Failed`], unless `emit` says to stop
    /// or the person stops it.
    fn reply(&self, request: ReplyRequest<'_>, emit: &mut dyn FnMut(TurnEvent) -> Flow);
}
