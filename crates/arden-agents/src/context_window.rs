//! The context window (ADR 0044): how much of a session's conversation the agent can take in at
//! once, and how full it is, as the agent CLI reports it. The shape is every agent's; each driver
//! fills it, and Arden Code computes none of its figures.

use serde::{Deserialize, Serialize};
use specta::Type;

/// What a part of the context window is, as the agent CLI says.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ContextPartKind {
    /// In the window: the system prompt, the tools, the messages.
    Used,
    /// Loaded only when needed, so not in the window yet.
    Deferred,
    /// Kept free, so the agent CLI can compact the conversation.
    Buffer,
    /// Room left.
    Free,
    /// A kind the agent CLI added after this version of Arden Code.
    Other,
}

/// One part of what fills the context window, under the agent CLI's own name for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ContextPart {
    /// Such as "Messages" or "Free space".
    pub name: String,
    pub tokens: u32,
    pub kind: ContextPartKind,
}

/// How full a session's context window is, as the agent CLI last reported it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ContextWindow {
    /// The tokens in the window.
    pub used: u32,
    /// How many tokens the window holds, which depends on the model.
    pub size: u32,
    /// How full it is, in whole percent.
    pub percent: u32,
    /// The tokens at which the agent CLI compacts the conversation, when it does.
    pub compacts_at: Option<u32>,
    /// What fills it, in the agent CLI's order.
    pub parts: Vec<ContextPart>,
}
