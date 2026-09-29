//! `install_panic_hook` replaces the process's panic hook, so this file holds the only test that
//! calls it.

use std::fs;
use std::panic;

use arden_diagnostics::crash;
use arden_diagnostics::redact::Redactor;
use serde_json::Value;

#[test]
fn a_panic_leaves_a_redacted_crash_report() {
    let folder = tempfile::tempdir().unwrap();
    crash::install_panic_hook(folder.path(), "9.8.7", Redactor::new(&[]));

    let result = panic::catch_unwind(|| {
        panic!(r"could not open C:\Users\Ada\notes.txt for ada@example.com");
    });
    assert!(result.is_err());

    let reports: Vec<_> = fs::read_dir(folder.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(reports.len(), 1);
    let name = reports[0]
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert!(
        name.starts_with("crash-") && reports[0].extension().is_some_and(|ext| ext == "json"),
        "{name}"
    );

    let text = fs::read_to_string(&reports[0]).unwrap();
    let report: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(report["version"], "9.8.7");
    assert!(report["timestamp"].as_str().unwrap().ends_with('Z'));
    assert!(
        report["message"]
            .as_str()
            .unwrap()
            .contains("could not open")
    );
    assert!(
        report["location"].as_str().unwrap().contains("crash.rs"),
        "{}",
        report["location"]
    );
    assert!(!report["backtrace"].as_str().unwrap().is_empty());

    assert!(
        !text.contains("Ada") && !text.contains("ada@example.com"),
        "{text}"
    );
}
