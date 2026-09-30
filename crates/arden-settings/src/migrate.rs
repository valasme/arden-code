//! Upgrading settings files written by older versions of Arden Code.

use serde_json::{Map, Value};

use crate::settings::CURRENT_VERSION;

/// Why a settings file could not be upgraded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrateError {
    /// The file is not a JSON object.
    NotAnObject,
    /// The version is not a whole number.
    BadVersion,
    /// The file was written by a newer Arden Code, so this one cannot understand it.
    FromTheFuture(u64),
}

impl std::fmt::Display for MigrateError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotAnObject => formatter.write_str("the file is not a JSON object"),
            Self::BadVersion => formatter.write_str("the version is not a whole number"),
            Self::FromTheFuture(version) => write!(
                formatter,
                "the file has version {version}, but this Arden Code only understands up to {CURRENT_VERSION}"
            ),
        }
    }
}

impl std::error::Error for MigrateError {}

/// Version 0 kept the theme at the top level, before settings were grouped.
fn from_version_0(settings: &mut Map<String, Value>) {
    if let Some(theme) = settings.remove("theme") {
        let appearance = settings
            .entry("appearance")
            .or_insert_with(|| Value::Object(Map::new()));
        if let Value::Object(appearance) = appearance {
            appearance.entry("theme").or_insert(theme);
        }
    }
}

/// Upgrades a settings file, step by step, to the current version. What the person added to the file
/// by hand is kept.
///
/// # Errors
///
/// Returns an error when the file is not an object, has a bad version, or is from a newer version.
pub fn migrate(mut file: Value) -> Result<Value, MigrateError> {
    let settings = file.as_object_mut().ok_or(MigrateError::NotAnObject)?;

    // A file with no version predates versioning.
    let mut version = match settings.get("version") {
        None => 0,
        Some(value) => value.as_u64().ok_or(MigrateError::BadVersion)?,
    };
    if version > u64::from(CURRENT_VERSION) {
        return Err(MigrateError::FromTheFuture(version));
    }

    while version < u64::from(CURRENT_VERSION) {
        match version {
            0 => from_version_0(settings),
            // Every version below the current one has a step above; this cannot be reached.
            _ => return Err(MigrateError::BadVersion),
        }
        version += 1;
    }
    settings.insert("version".to_owned(), Value::from(CURRENT_VERSION));
    Ok(file)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_file_without_a_version_predates_versioning_and_is_upgraded() {
        // Version 0 kept the theme at the top level.
        let upgraded = migrate(json!({ "theme": "dark" })).unwrap();

        assert_eq!(
            upgraded,
            json!({ "version": 1, "appearance": { "theme": "dark" } })
        );
    }

    #[test]
    fn keeps_what_a_person_added_to_an_old_file() {
        let upgraded =
            migrate(json!({ "theme": "light", "$schema": "x", "note": "mine" })).unwrap();

        assert_eq!(upgraded["note"], "mine");
        assert_eq!(upgraded["$schema"], "x");
        assert_eq!(upgraded["appearance"]["theme"], "light");
        assert!(
            upgraded.get("theme").is_none(),
            "the old top-level key is gone"
        );
    }

    #[test]
    fn an_empty_old_file_becomes_a_current_one() {
        assert_eq!(migrate(json!({})).unwrap(), json!({ "version": 1 }));
    }

    #[test]
    fn a_current_file_is_left_alone() {
        let current = json!({ "version": 1, "appearance": { "theme": "dark" } });

        assert_eq!(migrate(current.clone()).unwrap(), current);
    }

    #[test]
    fn a_file_from_a_newer_version_is_refused_so_it_is_not_damaged() {
        let error = migrate(json!({ "version": 99 })).unwrap_err();

        assert_eq!(error, MigrateError::FromTheFuture(99));
    }

    #[test]
    fn a_file_that_is_not_an_object_is_refused() {
        assert_eq!(
            migrate(json!([1, 2])).unwrap_err(),
            MigrateError::NotAnObject
        );
        assert_eq!(
            migrate(json!("text")).unwrap_err(),
            MigrateError::NotAnObject
        );
    }

    #[test]
    fn a_version_that_is_not_a_number_is_refused() {
        assert_eq!(
            migrate(json!({ "version": "one" })).unwrap_err(),
            MigrateError::BadVersion
        );
        assert_eq!(
            migrate(json!({ "version": -1 })).unwrap_err(),
            MigrateError::BadVersion
        );
    }
}
