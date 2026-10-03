//! Windows notifications, and the one rule that governs them: with notifications off, nothing is
//! shown. Every notification goes through [`send`], so no future feature can forget the rule.

use arden_core::error::ErrorCode;
use arden_settings::service::SettingsService;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Somewhere a notification can be shown.
pub trait Sink {
    /// Shows the notification.
    ///
    /// # Errors
    ///
    /// Returns what went wrong, as text.
    fn show(&self, title: &str, body: &str) -> Result<(), String>;
}

/// Shows a notification, unless notifications are off. Says whether one was shown.
///
/// # Errors
///
/// Returns an error when the sink could not show it.
pub fn send(enabled: bool, sink: &dyn Sink, title: &str, body: &str) -> Result<bool, String> {
    if !enabled {
        return Ok(false);
    }
    sink.show(title, body)?;
    Ok(true)
}

/// Shows a notification when the person is not looking at Arden Code, as the settings allow
/// (ADR 0039): an agent that waits for them says so. What went wrong is logged, never shown.
pub fn notify_when_away(app: &AppHandle, title: &str, body: &str) {
    let looking = app
        .get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false);
    if looking {
        return;
    }
    let enabled = app.state::<SettingsService>().get().notifications.desktop;
    #[cfg(debug_assertions)]
    let shown = match std::env::var_os(FILE_VARIABLE) {
        Some(file) => send(enabled, &File(file.into()), title, body),
        None => send(enabled, &Windows(app), title, body),
    };
    #[cfg(not(debug_assertions))]
    let shown = send(enabled, &Windows(app), title, body);
    if let Err(reason) = shown {
        tracing::warn!(
            code = ErrorCode::NotificationNotShown.as_str(),
            %reason,
            "a notification could not be shown"
        );
    }
}

/// Windows notifications, with the name and icon of the installed app.
pub struct Windows<'a>(pub &'a AppHandle);

impl Sink for Windows<'_> {
    fn show(&self, title: &str, body: &str) -> Result<(), String> {
        self.0
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|error| error.to_string())
    }
}

/// The variable that makes a debug build write notifications to a file instead of showing them, so
/// that a test can see whether one was sent without looking at the screen.
#[cfg(debug_assertions)]
pub const FILE_VARIABLE: &str = "ARDEN_CODE_NOTIFICATIONS_FILE";

/// Appends each notification to a file, one line each. Debug builds only.
#[cfg(debug_assertions)]
pub struct File(pub std::path::PathBuf);

#[cfg(debug_assertions)]
impl Sink for File {
    fn show(&self, title: &str, body: &str) -> Result<(), String> {
        use std::io::Write;

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.0)
            .map_err(|error| error.to_string())?;
        writeln!(file, "{title}\t{body}").map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    #[derive(Default)]
    struct Recorder(RefCell<Vec<(String, String)>>);

    impl Sink for Recorder {
        fn show(&self, title: &str, body: &str) -> Result<(), String> {
            self.0
                .borrow_mut()
                .push((title.to_owned(), body.to_owned()));
            Ok(())
        }
    }

    struct Broken;

    impl Sink for Broken {
        fn show(&self, _title: &str, _body: &str) -> Result<(), String> {
            Err("no toast".to_owned())
        }
    }

    #[test]
    fn shows_a_notification_when_they_are_on() {
        let sink = Recorder::default();

        let shown = send(true, &sink, "Arden Code", "A test");

        assert_eq!(shown, Ok(true));
        assert_eq!(
            sink.0.borrow().as_slice(),
            [("Arden Code".to_owned(), "A test".to_owned())]
        );
    }

    #[test]
    fn shows_nothing_when_they_are_off() {
        let sink = Recorder::default();

        let shown = send(false, &sink, "Arden Code", "A test");

        assert_eq!(shown, Ok(false));
        assert!(sink.0.borrow().is_empty());
    }

    #[test]
    fn says_so_when_windows_could_not_show_it() {
        assert_eq!(
            send(true, &Broken, "Arden Code", "A test"),
            Err("no toast".to_owned())
        );
        // Off is off, even when showing would have failed.
        assert_eq!(send(false, &Broken, "Arden Code", "A test"), Ok(false));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn a_file_collects_what_was_sent() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = File(folder.path().join("sent.txt"));

        send(true, &file, "Arden Code", "One").expect("written");
        send(true, &file, "Arden Code", "Two").expect("written");
        send(false, &file, "Arden Code", "Three").expect("nothing");

        assert_eq!(
            std::fs::read_to_string(folder.path().join("sent.txt")).expect("the file"),
            "Arden Code\tOne\nArden Code\tTwo\n"
        );
    }
}
