//! Claude's usage limits (ADR 0043): Claude Code's answer to `get_usage`, which the SDK marks
//! experimental. Only the 5-hour and weekly windows are read, and a field that is missing or of
//! another shape is skipped, so a change can only take figures away, never stop a reply.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::usage::{UsageLimits, UsageReport, UsageStatus, UsageWindow, UsageWindowKind};

/// The start of the id of every `get_usage` the driver sends, so that its answer is known.
pub const USAGE_REQUEST: &str = "arden-usage-";

/// The windows Arden Code shows, under the names Claude Code gives them.
const WINDOWS: [(&str, UsageWindowKind); 2] = [
    ("five_hour", UsageWindowKind::FiveHour),
    ("seven_day", UsageWindowKind::Weekly),
];

fn window(kind: UsageWindowKind, reported: &Value) -> Option<UsageWindow> {
    let utilization = reported["utilization"].as_f64()?;
    Some(UsageWindow {
        kind,
        percent: whole(utilization),
        resets_at: reported["resets_at"].as_str().map(str::to_owned),
        status: UsageStatus::Allowed,
    })
}

/// A percentage, rounded to a whole one, never below 0.
// The value is checked to be finite and at least 0, and rounded, before it is narrowed.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn whole(percent: f64) -> u32 {
    if percent.is_finite() {
        percent.max(0.0).round().min(f64::from(u32::MAX)) as u32
    } else {
        0
    }
}

/// The usage limits in Claude Code's answer to `get_usage`, or in its error.
#[must_use]
pub fn limits_in(error: Option<&str>, answer: &Value) -> UsageLimits {
    if error.is_some() {
        return UsageLimits {
            report: UsageReport::Unsupported,
            windows: Vec::new(),
        };
    }
    if answer["rate_limits_available"] == false {
        return UsageLimits {
            report: UsageReport::NotForThisSignIn,
            windows: Vec::new(),
        };
    }
    let reported = &answer["rate_limits"];
    UsageLimits {
        report: UsageReport::Reported,
        windows: WINDOWS
            .iter()
            .filter_map(|(name, kind)| window(*kind, &reported[*name]))
            .collect(),
    }
}

/// Hears new usage limits.
pub type Listener = Arc<dyn Fn(&UsageLimits) + Send + Sync>;

/// The usage limits Claude Code last reported, and when they were asked for.
#[derive(Default)]
pub struct Usage {
    limits: Mutex<UsageLimits>,
    /// Whether Arden Code asks at all: Show usage limits.
    asking: Mutex<bool>,
    asked: Mutex<Option<Instant>>,
    answered: Mutex<Option<Instant>>,
    listener: Mutex<Option<Listener>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Usage {
    pub fn limits(&self) -> UsageLimits {
        lock(&self.limits).clone()
    }

    pub fn ask(&self, asking: bool) {
        *lock(&self.asking) = asking;
    }

    pub fn listen(&self, listener: Listener) {
        *lock(&self.listener) = Some(listener);
    }

    /// Whether to ask now, which counts as asking: Arden Code is to ask, has not asked within
    /// `floor`, and has no answer younger than `older_than`.
    pub fn may_ask(&self, floor: Duration, older_than: Duration) -> bool {
        if !*lock(&self.asking)
            || lock(&self.answered).is_some_and(|answered| answered.elapsed() < older_than)
        {
            return false;
        }
        let mut asked = lock(&self.asked);
        if asked.is_some_and(|asked| asked.elapsed() < floor) {
            return false;
        }
        *asked = Some(Instant::now());
        true
    }

    /// Keeps the usage limits Claude Code answered with.
    pub fn answer(&self, limits: UsageLimits) {
        *lock(&self.answered) = Some(Instant::now());
        self.keep(limits);
    }

    /// Keeps new usage limits, and tells the listener when they changed.
    pub fn keep(&self, limits: UsageLimits) {
        let changed = {
            let mut kept = lock(&self.limits);
            let changed = *kept != limits;
            *kept = limits;
            changed
        };
        let listener = lock(&self.listener).clone();
        if changed && let Some(listener) = listener {
            listener(&self.limits());
        }
    }
}
