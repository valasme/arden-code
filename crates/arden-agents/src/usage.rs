//! Usage limits (ADR 0043): how much of an agent the person's plan allows within a window of time,
//! as the agent CLI reports it. The shape is every agent's; each driver fills it.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Which window a usage limit covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UsageWindowKind {
    /// The 5-hour limit.
    FiveHour,
    /// The weekly limit.
    Weekly,
}

/// What the agent CLI last said about a window, beside its percentage.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UsageStatus {
    #[default]
    Allowed,
    /// Near the limit, as the agent CLI judges it.
    Warning,
    /// At the limit: replies are refused until the window resets.
    Rejected,
}

/// One window of a plan's usage limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub kind: UsageWindowKind,
    /// How much of the window is used, in whole percent. It can pass 100.
    pub percent: u32,
    /// When the window resets, in RFC 3339, when the agent CLI said.
    pub resets_at: Option<String>,
    pub status: UsageStatus,
}

/// What the agent CLI said about the person's usage limits as a whole.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UsageReport {
    /// Not asked yet, or no answer yet.
    #[default]
    Unknown,
    /// The windows are what it reported.
    Reported,
    /// The sign-in has no plan limits: an API key, a cloud provider, or signed out.
    NotForThisSignIn,
    /// This version of the agent CLI cannot report them.
    Unsupported,
}

/// The person's usage limits, as the agent CLI last reported them. Kept in memory only.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimits {
    pub report: UsageReport,
    /// The 5-hour limit, then the weekly limit, each when known.
    pub windows: Vec<UsageWindow>,
}
