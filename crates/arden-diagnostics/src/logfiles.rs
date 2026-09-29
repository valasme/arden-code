//! Log files: one JSON-lines file per day, redacted, kept for a limited time and size.
//!
//! Days are UTC days, like every timestamp the app stores.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use time::{Date, Month};

use crate::redact::Redactor;

/// How much log history is kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Retention {
    /// Files this many days old or older are deleted.
    pub days: u32,
    /// The total size of all log files, in bytes. The oldest files go first.
    pub max_bytes: u64,
}

impl Default for Retention {
    fn default() -> Self {
        Self {
            days: 14,
            max_bytes: 100 * 1024 * 1024,
        }
    }
}

const PREFIX: &str = "arden-";
const SUFFIX: &str = ".jsonl";

/// The name of the log file for a day, such as `arden-2026-09-29.jsonl`.
#[must_use]
pub fn file_name(date: Date) -> String {
    format!(
        "{PREFIX}{:04}-{:02}-{:02}{SUFFIX}",
        date.year(),
        u8::from(date.month()),
        date.day()
    )
}

/// The day a log file name stands for, or `None` for any other file.
fn parse_file_name(name: &str) -> Option<Date> {
    let stem = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    let mut parts = stem.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u8 = parts.next()?.parse().ok()?;
    let day: u8 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Date::from_calendar_date(year, Month::try_from(month).ok()?, day).ok()
}

/// Deletes log files that are too old, then the oldest ones until the total size fits. Today's file
/// is never deleted. Files that are not logs are left alone.
pub fn prune(folder: &Path, today: Date, retention: Retention) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };

    let mut logs: Vec<(Date, PathBuf, u64)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let date = parse_file_name(&entry.file_name().to_string_lossy())?;
            let size = entry.metadata().ok()?.len();
            Some((date, entry.path(), size))
        })
        .collect();
    logs.sort_by_key(|(date, _, _)| *date);

    let expired = |date: Date| (today - date).whole_days() >= i64::from(retention.days);
    logs.retain(|(date, path, _)| {
        if expired(*date) && *date != today {
            let _ = fs::remove_file(path);
            false
        } else {
            true
        }
    });

    let mut total: u64 = logs.iter().map(|(_, _, size)| size).sum();
    for (date, path, size) in &logs {
        if total <= retention.max_bytes || *date == today {
            break;
        }
        if fs::remove_file(path).is_ok() {
            total -= size;
        }
    }
}

/// Writes redacted log lines to the file of the current day, starting a new file when the day
/// changes and pruning old ones.
pub struct DailyLogWriter {
    folder: PathBuf,
    redactor: Redactor,
    retention: Retention,
    today: Box<dyn Fn() -> Date + Send>,
    file: Option<(Date, File)>,
    /// The start of a line that has not ended yet.
    pending: Vec<u8>,
}

impl DailyLogWriter {
    /// `today` tells the writer what day it is, so that tests can move the clock.
    pub fn new(
        folder: &Path,
        redactor: Redactor,
        retention: Retention,
        today: impl Fn() -> Date + Send + 'static,
    ) -> Self {
        Self {
            folder: folder.to_path_buf(),
            redactor,
            retention,
            today: Box::new(today),
            file: None,
            pending: Vec::new(),
        }
    }

    fn file_for_today(&mut self) -> io::Result<&mut File> {
        let today = (self.today)();
        if self.file.as_ref().is_none_or(|(date, _)| *date != today) {
            fs::create_dir_all(&self.folder)?;
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.folder.join(file_name(today)))?;
            self.file = Some((today, file));
            prune(&self.folder, today, self.retention);
        }
        match &mut self.file {
            Some((_, file)) => Ok(file),
            None => Err(io::Error::other("log file is not open")),
        }
    }

    fn write_line(&mut self, line: &[u8]) -> io::Result<()> {
        let text = String::from_utf8_lossy(line);
        let mut redacted = self.redactor.redact(text.trim_end_matches(['\r', '\n']));
        redacted.push('\n');
        self.file_for_today()?.write_all(redacted.as_bytes())
    }
}

impl Write for DailyLogWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buffer);
        // A line is only written once it is complete, so a secret split across two writes is
        // still redacted as a whole.
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            self.write_line(&line)?;
        }
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        match &mut self.file {
            Some((_, file)) => file.flush(),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    use time::{Date, Month};

    use super::*;
    use crate::redact::Redactor;

    fn day(month: Month, day: u8) -> Date {
        Date::from_calendar_date(2026, month, day).unwrap()
    }

    fn names(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn write_file(folder: &Path, date: Date, bytes: usize) {
        fs::write(folder.join(file_name(date)), vec![b'x'; bytes]).unwrap();
    }

    fn writer(folder: &Path, today: Arc<Mutex<Date>>) -> DailyLogWriter {
        let redactor = Redactor::new(&[]);
        DailyLogWriter::new(folder, redactor, Retention::default(), move || {
            *today.lock().unwrap()
        })
    }

    #[test]
    fn a_days_log_file_is_named_after_its_date() {
        assert_eq!(
            file_name(day(Month::September, 29)),
            "arden-2026-09-29.jsonl"
        );
    }

    #[test]
    fn writes_each_line_to_the_file_of_the_current_day() {
        let folder = tempfile::tempdir().unwrap();
        let today = Arc::new(Mutex::new(day(Month::September, 29)));
        let mut log = writer(folder.path(), today);

        log.write_all(b"{\"message\":\"first\"}\n{\"message\":\"second\"}\n")
            .unwrap();
        log.flush().unwrap();

        let text = fs::read_to_string(folder.path().join("arden-2026-09-29.jsonl")).unwrap();
        assert_eq!(text, "{\"message\":\"first\"}\n{\"message\":\"second\"}\n");
    }

    #[test]
    fn redacts_every_line_before_it_reaches_the_disk() {
        let folder = tempfile::tempdir().unwrap();
        let today = Arc::new(Mutex::new(day(Month::September, 29)));
        let mut log = writer(folder.path(), today);

        log.write_all(b"{\"message\":\"sent to ada@example.com from C:\\\\Users\\\\Ada\\\\x\"}\n")
            .unwrap();
        log.flush().unwrap();

        let text = fs::read_to_string(folder.path().join("arden-2026-09-29.jsonl")).unwrap();
        assert!(
            !text.contains("ada@example.com") && !text.contains("Ada"),
            "{text}"
        );
        assert!(
            text.contains("[email]") && text.contains("%USERPROFILE%"),
            "{text}"
        );
    }

    #[test]
    fn redacts_a_line_that_arrives_in_several_pieces() {
        let folder = tempfile::tempdir().unwrap();
        let today = Arc::new(Mutex::new(day(Month::September, 29)));
        let mut log = writer(folder.path(), today);

        // A secret split across two writes must still be recognized as one.
        log.write_all(b"{\"message\":\"key ghp_123456789").unwrap();
        log.write_all(b"0abcdefghijklmnopqrstuvwxyz\"}\n").unwrap();
        log.flush().unwrap();

        let text = fs::read_to_string(folder.path().join("arden-2026-09-29.jsonl")).unwrap();
        assert!(!text.contains("ghp_"), "{text}");
    }

    #[test]
    fn starts_a_new_file_when_the_day_changes() {
        let folder = tempfile::tempdir().unwrap();
        let today = Arc::new(Mutex::new(day(Month::September, 29)));
        let mut log = writer(folder.path(), Arc::clone(&today));

        log.write_all(b"{\"message\":\"before midnight\"}\n")
            .unwrap();
        *today.lock().unwrap() = day(Month::September, 30);
        log.write_all(b"{\"message\":\"after midnight\"}\n")
            .unwrap();
        log.flush().unwrap();

        assert_eq!(
            names(folder.path()),
            ["arden-2026-09-29.jsonl", "arden-2026-09-30.jsonl"]
        );
        let second = fs::read_to_string(folder.path().join("arden-2026-09-30.jsonl")).unwrap();
        assert_eq!(second, "{\"message\":\"after midnight\"}\n");
    }

    #[test]
    fn appends_when_the_app_restarts_on_the_same_day() {
        let folder = tempfile::tempdir().unwrap();
        let today = Arc::new(Mutex::new(day(Month::September, 29)));
        writer(folder.path(), Arc::clone(&today))
            .write_all(b"one\n")
            .unwrap();

        let mut second_run = writer(folder.path(), today);
        second_run.write_all(b"two\n").unwrap();
        second_run.flush().unwrap();

        let text = fs::read_to_string(folder.path().join("arden-2026-09-29.jsonl")).unwrap();
        assert_eq!(text, "one\ntwo\n");
    }

    #[test]
    fn keeps_only_the_last_14_days() {
        let folder = tempfile::tempdir().unwrap();
        // 30 September is today. The 14 days kept are 17 to 30 September.
        for date in [
            day(Month::September, 15),
            day(Month::September, 16),
            day(Month::September, 17),
            day(Month::September, 30),
        ] {
            write_file(folder.path(), date, 10);
        }

        prune(
            folder.path(),
            day(Month::September, 30),
            Retention::default(),
        );

        assert_eq!(
            names(folder.path()),
            ["arden-2026-09-17.jsonl", "arden-2026-09-30.jsonl"]
        );
    }

    #[test]
    fn deletes_the_oldest_files_first_when_the_total_size_is_over_the_cap() {
        let folder = tempfile::tempdir().unwrap();
        for (date, bytes) in [
            (day(Month::September, 27), 400),
            (day(Month::September, 28), 400),
            (day(Month::September, 29), 400),
        ] {
            write_file(folder.path(), date, bytes);
        }
        let retention = Retention {
            days: 14,
            max_bytes: 900,
        };

        prune(folder.path(), day(Month::September, 29), retention);

        assert_eq!(
            names(folder.path()),
            ["arden-2026-09-28.jsonl", "arden-2026-09-29.jsonl"]
        );
    }

    #[test]
    fn never_deletes_todays_file_even_when_it_alone_is_over_the_cap() {
        let folder = tempfile::tempdir().unwrap();
        write_file(folder.path(), day(Month::September, 29), 5000);

        prune(
            folder.path(),
            day(Month::September, 29),
            Retention {
                days: 14,
                max_bytes: 100,
            },
        );

        assert_eq!(names(folder.path()), ["arden-2026-09-29.jsonl"]);
    }

    #[test]
    fn leaves_files_that_are_not_logs_alone() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("notes.txt"), "keep me").unwrap();
        fs::write(folder.path().join("arden-not-a-date.jsonl"), "keep me too").unwrap();
        write_file(folder.path(), day(Month::January, 1), 10);

        prune(
            folder.path(),
            day(Month::September, 29),
            Retention::default(),
        );

        assert_eq!(
            names(folder.path()),
            ["arden-not-a-date.jsonl", "notes.txt"]
        );
    }
}
