//! The interface every agent implements (ADR 0017).

use crate::model::TurnEvent;

/// Whether the driver should carry on after an event, or stop because nobody is listening.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Stop,
}

/// An agent that answers messages. Claude and Codex will implement this next to the Demo agent.
pub trait AgentDriver: Send + Sync {
    /// Answers `prompt`, passing each event of the reply to `emit` as it happens. The reply ends
    /// with [`TurnEvent::Finished`] or [`TurnEvent::Failed`], unless `emit` says to stop.
    fn reply(&self, turn_id: &str, prompt: &str, emit: &mut dyn FnMut(TurnEvent) -> Flow);
}
