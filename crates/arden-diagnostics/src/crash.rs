//! Crash reports: what a Rust panic leaves behind for the user to share.

use std::backtrace::Backtrace;
use std::fs;
use std::panic::{self, PanicHookInfo};
use std::path::{Path, PathBuf};

use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::redact::Redactor;

/// Makes every panic write a report into `folder`, then carries on with the previous hook, which
/// prints the panic as usual. Nothing in a report leaves the machine unless the user shares it.
pub fn install_panic_hook(folder: &Path, version: &'static str, redactor: Redactor) {
    let folder = folder.to_path_buf();
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        write_report(&folder, version, &redactor, info);
        previous(info);
    }));
}

const ACKNOWLEDGED: &str = "acknowledged.txt";

fn is_report(name: &str) -> bool {
    name.starts_with("crash-") && name.to_lowercase().ends_with(".json")
}

/// The names of the crash reports in `folder`, oldest first.
fn reports(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_report(name))
        .collect();
    names.sort();
    names
}

/// The crash reports the person has not been told about yet: the reason to offer diagnostics after
/// a crash.
#[must_use]
pub fn pending(folder: &Path) -> Vec<String> {
    let seen = fs::read_to_string(folder.join(ACKNOWLEDGED)).unwrap_or_default();
    let seen: Vec<&str> = seen.lines().collect();
    reports(folder)
        .into_iter()
        .filter(|name| !seen.contains(&name.as_str()))
        .collect()
}

/// Remembers that the person has been told about every report there is now. The reports stay, so
/// that a diagnostics bundle can still include them.
///
/// # Errors
///
/// Returns an error when the note cannot be written.
pub fn acknowledge(folder: &Path) -> std::io::Result<()> {
    fs::create_dir_all(folder)?;
    let mut text = reports(folder).join("\n");
    text.push('\n');
    fs::write(folder.join(ACKNOWLEDGED), text)
}

fn message(info: &PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    payload
        .downcast_ref::<&str>()
        .map(|text| (*text).to_owned())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "a panic without a text message".to_owned())
}

fn write_report(folder: &Path, version: &str, redactor: &Redactor, info: &PanicHookInfo<'_>) {
    let now = OffsetDateTime::now_utc();
    let location = info.location().map_or_else(
        || "unknown".to_owned(),
        |place| format!("{}:{}:{}", place.file(), place.line(), place.column()),
    );
    let report = serde_json::json!({
        "version": version,
        "timestamp": now.format(&Rfc3339).unwrap_or_default(),
        "thread": std::thread::current().name().unwrap_or("unnamed"),
        "message": message(info),
        "location": location,
        "backtrace": Backtrace::force_capture().to_string(),
    });
    let text = redactor.redact(&serde_json::to_string_pretty(&report).unwrap_or_default());

    let name = format!(
        "crash-{:04}{:02}{:02}-{:02}{:02}{:02}-{}.json",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        std::process::id()
    );
    let path: PathBuf = folder.join(name);
    // Failing to write the report is not worth a second panic inside a panic hook.
    let _ = fs::create_dir_all(folder).and_then(|()| fs::write(path, text));
}

#[cfg(test)]
mod pending_tests {
    use super::*;

    #[test]
    fn a_new_crash_report_is_pending_until_the_person_has_been_told() {
        let folder = tempfile::tempdir().unwrap();
        assert!(
            pending(folder.path()).is_empty(),
            "no reports, nothing to offer"
        );

        fs::write(folder.path().join("crash-20260930-140509-1.json"), "{}").unwrap();
        assert_eq!(pending(folder.path()), ["crash-20260930-140509-1.json"]);

        acknowledge(folder.path()).unwrap();
        assert!(pending(folder.path()).is_empty());
        assert!(
            folder.path().join("crash-20260930-140509-1.json").exists(),
            "the report is kept"
        );
    }

    #[test]
    fn only_reports_made_after_the_last_time_are_pending_again() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("crash-20260930-140509-1.json"), "{}").unwrap();
        acknowledge(folder.path()).unwrap();

        fs::write(folder.path().join("crash-20260930-150000-2.json"), "{}").unwrap();

        assert_eq!(pending(folder.path()), ["crash-20260930-150000-2.json"]);
    }

    #[test]
    fn other_files_are_not_crash_reports() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("notes.txt"), "x").unwrap();
        fs::write(folder.path().join("crash-report.txt"), "x").unwrap();

        assert!(pending(folder.path()).is_empty());
    }

    #[test]
    fn a_folder_that_does_not_exist_has_no_pending_reports_and_can_be_acknowledged() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("nowhere");

        assert!(pending(&missing).is_empty());
        acknowledge(&missing).unwrap();
        assert!(pending(&missing).is_empty());
    }
}
