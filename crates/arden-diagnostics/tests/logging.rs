//! `init` installs a global logger, so this file holds the only test that calls it.

use std::fs;

use arden_diagnostics::logging;
use serde_json::Value;

#[test]
fn writes_redacted_json_lines_for_rust_and_ui_messages() {
    let folder = tempfile::tempdir().unwrap();
    logging::init(folder.path(), &[r"D:\Profiles\ada"]).expect("logging starts");

    tracing::info!(
        code = "ARD-SET-002",
        r"settings file is invalid: C:\Users\Ada\settings.json"
    );
    tracing::debug!("this message is below the default level and is not written");
    logging::ui(
        logging::UiLevel::Error,
        "settings",
        "failed for ada@example.com",
        Some("ARD-APP-002"),
    );
    logging::flush();

    let files: Vec<_> = fs::read_dir(folder.path()).unwrap().collect();
    assert_eq!(files.len(), 1, "one file per day");
    let text = fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap();
    let lines: Vec<Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).expect("each line is JSON"))
        .collect();

    assert_eq!(lines.len(), 2, "{text}");
    assert_eq!(lines[0]["level"], "INFO");
    assert_eq!(lines[0]["fields"]["code"], "ARD-SET-002");
    assert!(
        lines[0]["timestamp"].as_str().unwrap().ends_with('Z'),
        "timestamps are UTC"
    );
    assert_eq!(lines[1]["level"], "ERROR");
    assert_eq!(lines[1]["target"], "ui");
    assert_eq!(lines[1]["fields"]["source"], "settings");
    assert_eq!(lines[1]["fields"]["code"], "ARD-APP-002");

    // Private details never reach the file, from either side.
    assert!(
        !text.contains("Ada") && !text.contains("ada@example.com"),
        "{text}"
    );
    assert!(
        text.contains("%USERPROFILE%") && text.contains("[email]"),
        "{text}"
    );
}
