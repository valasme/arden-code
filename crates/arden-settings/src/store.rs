//! Reading and writing `settings.json`, safely.
//!
//! - Saves go to a temporary file first and are renamed into place, so a crash cannot leave half a
//!   file. The file being replaced is kept as `settings.backup.json`.
//! - A file that cannot be understood is renamed to `settings.invalid-<date>.json` and the defaults
//!   are used, so nothing a person wrote is lost and the app never fails to start.
//! - Keys a person added by hand are kept when the app saves.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use arden_core::error::{AppError, ErrorCode};
use schemars::schema_for;
use serde_json::Value;
use time::OffsetDateTime;

use crate::migrate::migrate;
use crate::settings::{CURRENT_VERSION, Settings};

/// The settings file.
pub const FILE: &str = "settings.json";
/// The JSON Schema next to it, so editors can autocomplete the file.
pub const SCHEMA_FILE: &str = "settings.schema.json";
/// The file that was replaced by the last save.
pub const BACKUP_FILE: &str = "settings.backup.json";

/// What loading found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Loaded {
    pub settings: Settings,
    /// Set when the file could not be used and the defaults are in effect (`ARD-SET-002`).
    pub notice: Option<AppError>,
}

/// The JSON Schema of the settings file.
///
/// # Panics
///
/// Never in practice: the schema is plain data that always serializes.
#[must_use]
pub fn schema() -> String {
    let mut text = serde_json::to_string_pretty(&schema_for!(Settings)).expect("a schema is JSON");
    text.push('\n');
    text
}

fn save_failed(error: &dyn std::fmt::Display) -> AppError {
    AppError::new(ErrorCode::SettingsSave).with_details(error.to_string())
}

/// Copies `from` into `into`, key by key, so that objects merge instead of being replaced.
fn merge(into: &mut Value, from: &Value) {
    match (into, from) {
        (Value::Object(into), Value::Object(from)) => {
            for (key, value) in from {
                match into.get_mut(key) {
                    Some(existing) => merge(existing, value),
                    None => {
                        into.insert(key.clone(), value.clone());
                    }
                }
            }
        }
        (into, from) => *into = from.clone(),
    }
}

/// Writes the settings on top of `base` (which holds anything a person added), atomically.
fn write(dir: &Path, mut base: Value, settings: &Settings) -> Result<(), AppError> {
    fs::create_dir_all(dir).map_err(|error| save_failed(&error))?;

    if !base.is_object() {
        base = Value::Object(serde_json::Map::new());
    }
    let typed = serde_json::to_value(settings).map_err(|error| save_failed(&error))?;
    merge(&mut base, &typed);
    if let Value::Object(object) = &mut base {
        object.insert(
            "$schema".to_owned(),
            Value::from(format!("./{SCHEMA_FILE}")),
        );
    }
    let mut text = serde_json::to_string_pretty(&base).map_err(|error| save_failed(&error))?;
    text.push('\n');

    let path = dir.join(FILE);
    if path.exists() {
        // The last known good file. Failing to keep it must not stop the save.
        let _ = fs::copy(&path, dir.join(BACKUP_FILE));
    }
    let temporary = dir.join(format!("{FILE}.tmp"));
    fs::write(&temporary, text).map_err(|error| save_failed(&error))?;
    fs::rename(&temporary, &path).map_err(|error| save_failed(&error))
}

/// The file as it is now, so that a save can keep what a person added. Anything unusable is ignored.
fn existing(dir: &Path) -> Value {
    fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null)
}

/// Saves the settings.
///
/// # Errors
///
/// `ARD-SET-001` when the folder or the file cannot be written.
pub fn save(dir: &Path, settings: &Settings) -> Result<(), AppError> {
    write(dir, existing(dir), settings)
}

fn write_schema(dir: &Path) -> io::Result<()> {
    let text = schema();
    let path = dir.join(SCHEMA_FILE);
    if fs::read_to_string(&path).is_ok_and(|current| current == text) {
        return Ok(());
    }
    fs::create_dir_all(dir)?;
    fs::write(path, text)
}

/// Reads and upgrades a settings file. The second value says whether it was upgraded.
fn parse(text: &str) -> Result<(Settings, Value, bool), String> {
    let file: Value = serde_json::from_str(text)
        .map_err(|error| format!("the file is not valid JSON: {error}"))?;
    let was_current =
        file.get("version").and_then(Value::as_u64) == Some(u64::from(CURRENT_VERSION));
    let upgraded = migrate(file).map_err(|error| error.to_string())?;
    // Anything missing from the file takes its default: the file is laid over the defaults.
    let mut complete = serde_json::to_value(Settings::default())
        .map_err(|error| format!("the defaults could not be read: {error}"))?;
    merge(&mut complete, &upgraded);
    let settings = serde_json::from_value(complete)
        .map_err(|error| format!("a setting has a value that is not allowed: {error}"))?;
    Ok((settings, upgraded, !was_current))
}

/// Whether the file can be used right now: it is missing (the defaults will be written) or valid.
#[must_use]
pub fn is_usable(dir: &Path) -> bool {
    match fs::read_to_string(dir.join(FILE)) {
        Ok(text) => parse(&text).is_ok(),
        Err(error) => error.kind() == io::ErrorKind::NotFound,
    }
}

/// Moves a file that cannot be used out of the way, keeping it for the person to fix.
fn keep_invalid_copy(dir: &Path, now: OffsetDateTime) {
    let stamp = format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    );
    let path = dir.join(FILE);
    let mut target: PathBuf = dir.join(format!("settings.invalid-{stamp}.json"));
    let mut attempt = 2;
    while target.exists() {
        target = dir.join(format!("settings.invalid-{stamp}-{attempt}.json"));
        attempt += 1;
    }
    if fs::rename(&path, &target).is_err() {
        let _ = fs::copy(&path, &target);
    }
}

/// Loads the settings. It never fails: whatever is wrong with the file, the app gets settings it can
/// use, and a notice when the defaults had to stand in for a file that could not be used.
#[must_use]
pub fn load(dir: &Path) -> Loaded {
    load_at(dir, OffsetDateTime::now_utc())
}

/// [`load`] with the time given, so that tests can predict the name of the kept copy.
#[must_use]
pub fn load_at(dir: &Path, now: OffsetDateTime) -> Loaded {
    // The schema is a convenience; the app works without it.
    let _ = write_schema(dir);

    let text = match fs::read_to_string(dir.join(FILE)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let settings = Settings::default();
            let _ = save(dir, &settings);
            return Loaded {
                settings,
                notice: None,
            };
        }
        Err(error) => {
            return use_defaults(dir, now, &format!("the file could not be read: {error}"));
        }
    };

    match parse(&text) {
        Ok((settings, upgraded, was_upgraded)) => {
            if was_upgraded {
                // Bring the file up to date, keeping what the person had added.
                let _ = write(dir, upgraded, &settings);
            }
            Loaded {
                settings,
                notice: None,
            }
        }
        Err(reason) => use_defaults(dir, now, &reason),
    }
}

fn use_defaults(dir: &Path, now: OffsetDateTime, reason: &str) -> Loaded {
    tracing::warn!(
        reason,
        "the settings file cannot be used; falling back to the defaults"
    );
    keep_invalid_copy(dir, now);
    let settings = Settings::default();
    let _ = save(dir, &settings);
    Loaded {
        settings,
        notice: Some(AppError::new(ErrorCode::SettingsInvalid).with_details(reason)),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use arden_core::error::ErrorCode;
    use serde_json::Value;
    use time::macros::datetime;

    use super::*;
    use crate::settings::{CURRENT_VERSION, SettingChange, Settings, Theme};

    const NOW: time::OffsetDateTime = datetime!(2026-09-30 14:05:09 UTC);

    fn names(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn read_json(path: &Path) -> Value {
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn the_first_launch_uses_the_defaults_and_creates_the_files_people_can_find() {
        let folder = tempfile::tempdir().unwrap();

        let loaded = load_at(folder.path(), NOW);

        assert_eq!(loaded.settings, Settings::default());
        assert!(loaded.notice.is_none());
        assert_eq!(
            names(folder.path()),
            ["settings.json", "settings.schema.json"]
        );
        assert_eq!(
            read_json(&folder.path().join("settings.json"))["appearance"]["theme"],
            "system"
        );
    }

    #[test]
    fn a_saved_setting_survives_a_restart() {
        let folder = tempfile::tempdir().unwrap();
        let mut settings = Settings::default();
        settings.apply(SettingChange::AppearanceTheme(Theme::Dark));

        save(folder.path(), &settings).unwrap();
        let loaded = load_at(folder.path(), NOW);

        assert_eq!(loaded.settings.appearance.theme, Theme::Dark);
        assert!(loaded.notice.is_none());
    }

    #[test]
    fn the_file_points_editors_at_its_schema_and_stays_readable() {
        let folder = tempfile::tempdir().unwrap();

        save(folder.path(), &Settings::default()).unwrap();

        let text = fs::read_to_string(folder.path().join("settings.json")).unwrap();
        assert_eq!(
            read_json(&folder.path().join("settings.json"))["$schema"],
            "./settings.schema.json"
        );
        assert!(
            text.contains("\n  "),
            "the file is indented so a person can read it"
        );
        assert!(text.ends_with('\n'));
    }

    #[test]
    fn the_schema_describes_the_settings_for_autocomplete() {
        let folder = tempfile::tempdir().unwrap();
        let _ = load_at(folder.path(), NOW);

        let schema = read_json(&folder.path().join("settings.schema.json"));

        assert_eq!(schema["type"], "object");
        let text = schema.to_string();
        for theme in ["system", "light", "dark"] {
            assert!(
                text.contains(&format!("\"{theme}\"")),
                "{theme} is missing from the schema"
            );
        }
        assert!(text.contains("appearance") && text.contains("theme"));
    }

    #[test]
    fn saving_keeps_the_previous_file_as_a_backup_and_leaves_nothing_else_behind() {
        let folder = tempfile::tempdir().unwrap();
        let mut first = Settings::default();
        first.apply(SettingChange::AppearanceTheme(Theme::Light));
        save(folder.path(), &first).unwrap();
        let mut second = Settings::default();
        second.apply(SettingChange::AppearanceTheme(Theme::Dark));

        save(folder.path(), &second).unwrap();

        assert_eq!(
            read_json(&folder.path().join("settings.json"))["appearance"]["theme"],
            "dark"
        );
        assert_eq!(
            read_json(&folder.path().join("settings.backup.json"))["appearance"]["theme"],
            "light"
        );
        assert_eq!(
            names(folder.path()),
            ["settings.backup.json", "settings.json"]
        );
    }

    #[test]
    fn a_broken_file_is_kept_as_a_timestamped_copy_and_the_defaults_take_over() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            folder.path().join("settings.json"),
            "{ \"appearance\": { \"theme\": ",
        )
        .unwrap();

        let loaded = load_at(folder.path(), NOW);

        assert_eq!(loaded.settings, Settings::default());
        let notice = loaded.notice.expect("the person is told");
        assert_eq!(notice.code, ErrorCode::SettingsInvalid);
        assert!(
            notice.details.is_some(),
            "the reason is recorded for the log"
        );
        // The damaged text is kept, so nothing the person wrote is lost.
        assert_eq!(
            fs::read_to_string(folder.path().join("settings.invalid-20260930-140509.json"))
                .unwrap(),
            "{ \"appearance\": { \"theme\": "
        );
        // A good file replaces it.
        assert_eq!(
            read_json(&folder.path().join("settings.json"))["version"],
            CURRENT_VERSION
        );
    }

    #[test]
    fn a_file_with_a_wrong_kind_of_value_is_treated_the_same_way() {
        for bad in [
            r#"{"version":1,"appearance":{"theme":"purple"}}"#,
            r#"{"version":1,"appearance":{"theme":5}}"#,
            r#"{"version":1,"appearance":[]}"#,
            "[]",
            "not json at all",
            "",
        ] {
            let folder = tempfile::tempdir().unwrap();
            fs::write(folder.path().join("settings.json"), bad).unwrap();

            let loaded = load_at(folder.path(), NOW);

            assert_eq!(loaded.settings, Settings::default(), "{bad}");
            assert_eq!(
                loaded.notice.map(|notice| notice.code),
                Some(ErrorCode::SettingsInvalid),
                "{bad}"
            );
            assert!(
                names(folder.path()).contains(&"settings.invalid-20260930-140509.json".to_owned()),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_file_from_a_newer_version_is_kept_rather_than_overwritten() {
        let folder = tempfile::tempdir().unwrap();
        let text = r#"{"version":99,"appearance":{"theme":"dark"},"somethingNew":true}"#;
        fs::write(folder.path().join("settings.json"), text).unwrap();

        let loaded = load_at(folder.path(), NOW);

        assert_eq!(
            loaded.notice.map(|notice| notice.code),
            Some(ErrorCode::SettingsInvalid)
        );
        assert_eq!(
            fs::read_to_string(folder.path().join("settings.invalid-20260930-140509.json"))
                .unwrap(),
            text
        );
    }

    #[test]
    fn an_older_file_is_upgraded_in_place_and_keeps_the_settings_it_had() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(folder.path().join("settings.json"), r#"{"theme":"dark"}"#).unwrap();

        let loaded = load_at(folder.path(), NOW);

        assert_eq!(loaded.settings.appearance.theme, Theme::Dark);
        assert!(loaded.notice.is_none(), "an upgrade is not an error");
        let file = read_json(&folder.path().join("settings.json"));
        assert_eq!(file["version"], CURRENT_VERSION);
        assert_eq!(file["appearance"]["theme"], "dark");
        // The file as it was before the upgrade is the last known good one.
        assert_eq!(
            fs::read_to_string(folder.path().join("settings.backup.json")).unwrap(),
            r#"{"theme":"dark"}"#
        );
    }

    #[test]
    fn a_setting_missing_from_the_file_takes_its_default() {
        for text in [r#"{"version":1}"#, r#"{"version":1,"appearance":{}}"#, "{}"] {
            let folder = tempfile::tempdir().unwrap();
            fs::write(folder.path().join("settings.json"), text).unwrap();

            let loaded = load_at(folder.path(), NOW);

            assert_eq!(loaded.settings, Settings::default(), "{text}");
            assert!(loaded.notice.is_none(), "{text}");
        }
    }

    #[test]
    fn what_a_person_adds_by_hand_survives_a_load() {
        let folder = tempfile::tempdir().unwrap();
        fs::write(
            folder.path().join("settings.json"),
            r#"{"$schema":"./settings.schema.json","version":1,"appearance":{"theme":"light"}}"#,
        )
        .unwrap();

        let loaded = load_at(folder.path(), NOW);

        assert_eq!(loaded.settings.appearance.theme, Theme::Light);
        assert!(loaded.notice.is_none());
        assert!(
            !names(folder.path())
                .iter()
                .any(|name| name.contains("invalid"))
        );
    }

    #[test]
    fn saving_into_a_folder_that_cannot_be_written_reports_the_settings_code() {
        let folder = tempfile::tempdir().unwrap();
        // A file where the folder should be.
        let blocked = folder.path().join("blocked");
        fs::write(&blocked, "in the way").unwrap();

        let error = save(&blocked.join("inside"), &Settings::default()).unwrap_err();

        assert_eq!(error.code, ErrorCode::SettingsSave);
    }
}
