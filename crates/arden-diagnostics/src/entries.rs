//! Reading the log files back, for the log viewer.

use std::fs;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use specta::Type;

use crate::logfiles;

/// One line of a log file, in the shape the log viewer shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Entry {
    /// When it happened, as `2026-09-30T14:05:09.123Z`.
    pub timestamp: String,
    /// `error`, `warn`, `info`, `debug` or `trace`.
    pub level: String,
    /// Which part of the app wrote it: a Rust module, or `ui/<part>` for a message from the UI.
    pub source: String,
    pub message: String,
    /// The error code, when the line is about an error.
    pub code: Option<String>,
}

/// Reads one line of a JSON-lines log. Anything that is not a log line gives `None`.
#[must_use]
pub fn parse_line(line: &str) -> Option<Entry> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    let object = value.as_object()?;
    let fields = object.get("fields")?.as_object()?;
    let text = |value: Option<&Value>| value.and_then(Value::as_str).map(str::to_owned);

    let target = text(object.get("target")).unwrap_or_default();
    let source = match (target.as_str(), text(fields.get("source"))) {
        ("ui", Some(part)) if !part.is_empty() => format!("ui/{part}"),
        (_, _) => target,
    };
    Some(Entry {
        timestamp: text(object.get("timestamp"))?,
        level: text(object.get("level"))?.to_lowercase(),
        source,
        message: text(fields.get("message")).unwrap_or_default(),
        code: text(fields.get("code")).filter(|code| !code.is_empty()),
    })
}

/// The newest `max` entries of the log files in `folder`, newest first. Lines that cannot be read
/// are skipped: a log that is being written can end in half a line.
#[must_use]
pub fn read_newest(folder: &Path, max: usize) -> Vec<Entry> {
    let mut files: Vec<_> = fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            logfiles::parse_file_name(&name).map(|date| (date, entry.path()))
        })
        .collect();
    files.sort_by_key(|(date, _)| std::cmp::Reverse(*date));

    let mut found = Vec::new();
    for (_, path) in files {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        found.extend(text.lines().rev().filter_map(parse_line));
        if found.len() >= max {
            break;
        }
    }
    found.truncate(max);
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUST_LINE: &str = r#"{"timestamp":"2026-09-30T14:05:09.123Z","level":"INFO","fields":{"message":"Arden Code started","version":"0.1.0"},"target":"arden_desktop_lib"}"#;
    const UI_LINE: &str = r#"{"timestamp":"2026-09-30T14:05:10.000Z","level":"ERROR","fields":{"message":"Uncaught error: x is undefined","source":"ui","code":"ARD-APP-002"},"target":"ui"}"#;

    #[test]
    fn a_line_from_rust_becomes_an_entry() {
        let entry = parse_line(RUST_LINE).unwrap();

        assert_eq!(entry.timestamp, "2026-09-30T14:05:09.123Z");
        assert_eq!(entry.level, "info");
        assert_eq!(entry.source, "arden_desktop_lib");
        assert_eq!(entry.message, "Arden Code started");
        assert_eq!(entry.code, None);
    }

    #[test]
    fn a_line_from_the_ui_names_the_part_of_the_ui_and_keeps_its_error_code() {
        let entry = parse_line(UI_LINE).unwrap();

        assert_eq!(entry.level, "error");
        assert_eq!(entry.source, "ui/ui");
        assert_eq!(entry.code.as_deref(), Some("ARD-APP-002"));
        assert!(entry.message.contains("x is undefined"));
    }

    #[test]
    fn the_part_of_the_ui_is_its_own_name() {
        let line = r#"{"timestamp":"t","level":"WARN","fields":{"message":"m","source":"sessions"},"target":"ui"}"#;

        assert_eq!(parse_line(line).unwrap().source, "ui/sessions");
    }

    #[test]
    fn anything_that_is_not_a_log_line_is_skipped() {
        for bad in [
            "",
            "not json",
            "[]",
            r#"{"level":"INFO"}"#,
            r#"{"timestamp":"t","level":"INFO"}"#,
            "{\"timestamp\":\"2026-09-30T14:05:09Z\",\"lev",
        ] {
            assert_eq!(parse_line(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn the_newest_entries_come_first_across_files() {
        let folder = tempfile::tempdir().unwrap();
        let line = |time: &str, message: &str| {
            format!(
                r#"{{"timestamp":"{time}","level":"INFO","fields":{{"message":"{message}"}},"target":"t"}}"#
            )
        };
        fs::write(
            folder.path().join("arden-2026-09-29.jsonl"),
            format!(
                "{}\n{}\n",
                line("2026-09-29T10:00:00Z", "old one"),
                line("2026-09-29T11:00:00Z", "old two")
            ),
        )
        .unwrap();
        fs::write(
            folder.path().join("arden-2026-09-30.jsonl"),
            format!(
                "{}\n{}\n",
                line("2026-09-30T10:00:00Z", "new one"),
                line("2026-09-30T11:00:00Z", "new two")
            ),
        )
        .unwrap();
        fs::write(folder.path().join("notes.txt"), "not a log").unwrap();

        let messages: Vec<_> = read_newest(folder.path(), 10)
            .into_iter()
            .map(|entry| entry.message)
            .collect();

        assert_eq!(messages, ["new two", "new one", "old two", "old one"]);
    }

    #[test]
    fn only_as_many_as_asked_for_are_returned() {
        let folder = tempfile::tempdir().unwrap();
        let lines = (0..20)
            .map(|number| {
                format!(
                    "{{\"timestamp\":\"2026-09-30T10:00:{number:02}Z\",\"level\":\"INFO\",\"fields\":{{\"message\":\"line {number}\"}},\"target\":\"t\"}}"
                )
            })
            .collect::<Vec<_>>()
            .join("
");
        fs::write(folder.path().join("arden-2026-09-30.jsonl"), lines).unwrap();

        let entries = read_newest(folder.path(), 5);

        assert_eq!(entries.len(), 5);
        assert_eq!(entries[0].message, "line 19");
        assert_eq!(entries[4].message, "line 15");
    }

    #[test]
    fn a_half_written_last_line_and_a_missing_folder_do_no_harm() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            folder.path().join("arden-2026-09-30.jsonl"),
            format!("{RUST_LINE}\n{{\"timestamp\":\"2026-09-30T14:0"),
        )
        .unwrap();

        assert_eq!(read_newest(folder.path(), 10).len(), 1);
        assert!(read_newest(&folder.path().join("nowhere"), 10).is_empty());
    }
}
