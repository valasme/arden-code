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
