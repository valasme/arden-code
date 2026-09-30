//! The diagnostics bundle: a zip file a person can attach to a bug report.
//!
//! It holds the recent logs, the settings, what the app knows about the computer, and crash
//! reports. Everything in it has been through the redactor, and nothing in it leaves the computer
//! unless the person shares the file.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::redact::Redactor;

/// What goes into a bundle.
pub struct Inputs<'a> {
    pub logs: &'a Path,
    pub crashes: &'a Path,
    /// The settings file as text.
    pub settings: &'a str,
    /// What the app knows about the computer, as text.
    pub system_info: &'a str,
    pub redactor: &'a Redactor,
}

fn add_text(
    writer: &mut ZipWriter<File>,
    name: &str,
    text: &str,
    options: SimpleFileOptions,
) -> io::Result<()> {
    writer.start_file(name, options).map_err(io::Error::other)?;
    writer.write_all(text.as_bytes())
}

/// Adds every file of a folder under `prefix`, with its text redacted again. Files that cannot be
/// read as text are left out.
fn add_folder(
    writer: &mut ZipWriter<File>,
    folder: &Path,
    prefix: &str,
    redactor: &Redactor,
    options: SimpleFileOptions,
) -> io::Result<()> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Ok(());
    };
    let mut names: Vec<_> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    for name in names {
        if let Ok(text) = fs::read_to_string(folder.join(&name)) {
            add_text(
                writer,
                &format!("{prefix}/{name}"),
                &redactor.redact(&text),
                options,
            )?;
        }
    }
    Ok(())
}

/// Writes the bundle to `path`.
///
/// # Errors
///
/// Returns an error when the file cannot be written.
pub fn write(path: &Path, inputs: &Inputs<'_>) -> io::Result<()> {
    let mut writer = ZipWriter::new(File::create(path)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    add_text(
        &mut writer,
        "system-info.txt",
        &inputs.redactor.redact(inputs.system_info),
        options,
    )?;
    add_text(
        &mut writer,
        "settings.json",
        &inputs.redactor.redact(inputs.settings),
        options,
    )?;
    add_folder(&mut writer, inputs.logs, "logs", inputs.redactor, options)?;
    add_folder(
        &mut writer,
        inputs.crashes,
        "crashes",
        inputs.redactor,
        options,
    )?;
    writer.finish().map_err(io::Error::other)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::io::Read;

    use super::*;

    /// Reads a bundle back: the name of each file and its text.
    fn read(path: &Path) -> BTreeMap<String, String> {
        let mut archive = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
        (0..archive.len())
            .map(|index| {
                let mut file = archive.by_index(index).unwrap();
                let mut text = String::new();
                file.read_to_string(&mut text).unwrap();
                (file.name().to_owned(), text)
            })
            .collect()
    }

    fn inputs<'a>(
        logs: &'a Path,
        crashes: &'a Path,
        settings: &'a str,
        system_info: &'a str,
        redactor: &'a Redactor,
    ) -> Inputs<'a> {
        Inputs {
            logs,
            crashes,
            settings,
            system_info,
            redactor,
        }
    }

    #[test]
    fn holds_the_logs_the_crash_reports_the_settings_and_the_system_information() {
        let folder = tempfile::tempdir().unwrap();
        let logs = folder.path().join("logs");
        let crashes = folder.path().join("crashes");
        fs::create_dir_all(&logs).unwrap();
        fs::create_dir_all(&crashes).unwrap();
        fs::write(logs.join("arden-2026-09-30.jsonl"), "a log line\n").unwrap();
        fs::write(crashes.join("crash-1.json"), "{\"message\":\"boom\"}").unwrap();
        let redactor = Redactor::new(&[]);
        let target = folder.path().join("bundle.zip");

        write(
            &target,
            &inputs(
                &logs,
                &crashes,
                "{\"version\":1}",
                "Arden Code 0.1.0",
                &redactor,
            ),
        )
        .unwrap();

        let files = read(&target);
        assert_eq!(
            files.keys().map(String::as_str).collect::<Vec<_>>(),
            [
                "crashes/crash-1.json",
                "logs/arden-2026-09-30.jsonl",
                "settings.json",
                "system-info.txt"
            ]
        );
        assert_eq!(files["system-info.txt"], "Arden Code 0.1.0");
        assert_eq!(files["settings.json"], "{\"version\":1}");
        assert_eq!(files["logs/arden-2026-09-30.jsonl"], "a log line\n");
    }

    #[test]
    fn nothing_private_is_in_it_whatever_file_it_came_from() {
        let folder = tempfile::tempdir().unwrap();
        let logs = folder.path().join("logs");
        fs::create_dir_all(&logs).unwrap();
        fs::write(
            logs.join("arden-2026-09-30.jsonl"),
            "opened C:\\Users\\alice\\Documents\\secret.txt and wrote to alice@example.com\n",
        )
        .unwrap();
        let redactor = Redactor::new(&["C:\\Users\\alice"]);
        let target = folder.path().join("bundle.zip");

        write(
            &target,
            &inputs(
                &logs,
                &folder.path().join("no-crashes"),
                "{\"note\":\"C:\\\\Users\\\\alice\\\\x\"}",
                "user alice@example.com",
                &redactor,
            ),
        )
        .unwrap();

        for (name, text) in read(&target) {
            assert!(!text.contains("alice"), "{name}: {text}");
        }
    }

    #[test]
    fn missing_folders_give_a_bundle_with_the_rest() {
        let folder = tempfile::tempdir().unwrap();
        let redactor = Redactor::new(&[]);
        let target = folder.path().join("bundle.zip");

        write(
            &target,
            &inputs(
                &folder.path().join("a"),
                &folder.path().join("b"),
                "{}",
                "info",
                &redactor,
            ),
        )
        .unwrap();

        assert_eq!(read(&target).len(), 2);
    }

    #[test]
    fn a_place_that_cannot_be_written_is_an_error() {
        let folder = tempfile::tempdir().unwrap();
        let redactor = Redactor::new(&[]);

        let result = write(
            &folder.path().join("no-such-folder").join("bundle.zip"),
            &inputs(folder.path(), folder.path(), "{}", "info", &redactor),
        );

        assert!(result.is_err());
    }
}
