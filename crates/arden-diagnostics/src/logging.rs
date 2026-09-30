//! Writing logs: Rust's `tracing` events and messages forwarded from the UI go to the same files.

use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use time::OffsetDateTime;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::prelude::*;
use tracing_subscriber::reload;

use crate::logfiles::{DailyLogWriter, Retention};
use crate::redact::Redactor;

/// Set this environment variable to change what is logged, for example `ARDEN_LOG=debug`.
pub const LEVEL_VARIABLE: &str = "ARDEN_LOG";

/// The longest message accepted from the UI, so a runaway loop cannot fill the disk in one call.
const MAX_UI_MESSAGE_BYTES: usize = 8 * 1024;

static WRITER: OnceLock<Arc<Mutex<DailyLogWriter>>> = OnceLock::new();
static FILTER: OnceLock<reload::Handle<EnvFilter, tracing_subscriber::Registry>> = OnceLock::new();

/// Lets every log event write to the one shared file writer.
#[derive(Clone)]
struct SharedWriter(Arc<Mutex<DailyLogWriter>>);

impl Write for SharedWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.0
            .lock()
            .map_err(|_| std::io::Error::other("the log writer is poisoned"))?
            .write(buffer)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.0
            .lock()
            .map_err(|_| std::io::Error::other("the log writer is poisoned"))?
            .flush()
    }
}

impl<'a> MakeWriter<'a> for SharedWriter {
    type Writer = Self;

    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

/// Why logging could not start.
#[derive(Debug)]
pub struct InitError(String);

impl std::fmt::Display for InitError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for InitError {}

/// Starts logging into `folder`, recording what `level` says (or what `ARDEN_LOG` says, when that
/// is set, so a developer can override it). `profile_folders` are folders that identify the user,
/// such as the home folder; they are removed from every line, along with email addresses and secrets.
///
/// # Errors
///
/// Returns an error when logging was already started.
pub fn init(folder: &Path, profile_folders: &[&str], level: UiLevel) -> Result<(), InitError> {
    let writer = Arc::new(Mutex::new(DailyLogWriter::new(
        folder,
        Redactor::new(profile_folders),
        Retention::default(),
        || OffsetDateTime::now_utc().date(),
    )));
    let filter = EnvFilter::try_from_env(LEVEL_VARIABLE)
        .unwrap_or_else(|_| EnvFilter::new(level.directive()));
    let (filter, handle) = reload::Layer::new(filter);
    let layer = fmt::layer()
        .json()
        .with_timer(UtcTime::rfc_3339())
        .with_ansi(false)
        .with_current_span(false)
        .with_span_list(false)
        .with_writer(SharedWriter(Arc::clone(&writer)));

    tracing_subscriber::registry()
        .with(filter)
        .with(layer)
        .try_init()
        .map_err(|error| InitError(error.to_string()))?;
    let _ = FILTER.set(handle);
    WRITER
        .set(writer)
        .map_err(|_| InitError("logging was already started".to_owned()))
}

/// Changes what is recorded from now on. Returns whether logging is running to be changed.
pub fn set_level(level: UiLevel) -> bool {
    FILTER
        .get()
        .is_some_and(|handle| handle.reload(EnvFilter::new(level.directive())).is_ok())
}

/// Writes anything still waiting to the file.
pub fn flush() {
    if let Some(writer) = WRITER.get()
        && let Ok(mut writer) = writer.lock()
    {
        let _ = writer.flush();
    }
}

/// How serious a message from the UI is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiLevel {
    Error,
    Warn,
    Info,
    Debug,
}

impl UiLevel {
    /// The filter that records this level and everything more serious.
    #[must_use]
    pub const fn directive(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
        }
    }
}

/// Cuts text to at most `max` bytes without splitting a character.
fn truncate(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Records a message from the UI in the same log as Rust's own. `source` says which part of the UI
/// sent it, and `code` is the error code when the message is about an error.
pub fn ui(level: UiLevel, source: &str, message: &str, code: Option<&str>) {
    let message = truncate(message, MAX_UI_MESSAGE_BYTES);
    let source = truncate(source, 64);
    match level {
        UiLevel::Error => tracing::error!(target: "ui", source, code, "{message}"),
        UiLevel::Warn => tracing::warn!(target: "ui", source, code, "{message}"),
        UiLevel::Info => tracing::info!(target: "ui", source, code, "{message}"),
        UiLevel::Debug => tracing::debug!(target: "ui", source, code, "{message}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{UiLevel, truncate};

    #[test]
    fn each_level_records_itself_and_what_is_more_serious() {
        assert_eq!(UiLevel::Error.directive(), "error");
        assert_eq!(UiLevel::Warn.directive(), "warn");
        assert_eq!(UiLevel::Info.directive(), "info");
        assert_eq!(UiLevel::Debug.directive(), "debug");
    }

    #[test]
    fn truncates_long_text_without_splitting_a_character() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("a long sentence", 6), "a long");
        // "é" is two bytes: cutting in the middle of it must back up.
        assert_eq!(truncate("aéb", 2), "a");
    }
}
