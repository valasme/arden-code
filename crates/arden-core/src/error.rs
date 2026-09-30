//! Typed errors with stable codes (ADR 0008).

use std::fmt;

use serde::{Deserialize, Serialize};
use specta::Type;
use strum::EnumIter;

/// Every error a user can see. The written form, `ARD-<AREA>-<NNN>`, is stable and appears both on
/// the error screen and in the logs. Codes are listed in `docs/error-codes.md`, and a test keeps
/// that page in sync with this enum. Never reuse or renumber a code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type, EnumIter)]
pub enum ErrorCode {
    /// Something went wrong that nobody planned for.
    #[serde(rename = "ARD-APP-001")]
    Unexpected,
    /// The UI hit an error it could not handle.
    #[serde(rename = "ARD-APP-002")]
    UiFailure,
    /// The settings could not be saved.
    #[serde(rename = "ARD-SET-001")]
    SettingsSave,
    /// The settings file was not valid, so the defaults are in use.
    #[serde(rename = "ARD-SET-002")]
    SettingsInvalid,
    /// The logs folder could not be opened.
    #[serde(rename = "ARD-LOG-001")]
    LogsFolder,
    /// Windows' window menu could not be opened.
    #[serde(rename = "ARD-WIN-001")]
    WindowsSystemMenu,
}

impl ErrorCode {
    /// The code as written, such as `ARD-WIN-001`.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unexpected => "ARD-APP-001",
            Self::UiFailure => "ARD-APP-002",
            Self::SettingsSave => "ARD-SET-001",
            Self::SettingsInvalid => "ARD-SET-002",
            Self::LogsFolder => "ARD-LOG-001",
            Self::WindowsSystemMenu => "ARD-WIN-001",
        }
    }
}

/// The error every command returns: a code, the translation key of its message, and details for
/// the logs and for "Copy details".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    /// The key in the UI's language file that says what happened, why, and what to do.
    pub message_key: String,
    /// Technical detail that helps find the cause. Never shown as the message itself.
    pub details: Option<String>,
}

impl AppError {
    #[must_use]
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            message_key: format!("errors.{}", code.as_str()),
            details: None,
        }
    }

    #[must_use]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.details {
            Some(details) => write!(formatter, "{}: {details}", self.code.as_str()),
            None => formatter.write_str(self.code.as_str()),
        }
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use strum::IntoEnumIterator;

    use super::*;

    #[test]
    fn every_code_has_the_form_ard_area_number() {
        for code in ErrorCode::iter() {
            let text = code.as_str();
            let parts: Vec<&str> = text.split('-').collect();

            assert_eq!(parts.len(), 3, "{text}");
            assert_eq!(parts[0], "ARD", "{text}");
            assert!(
                [
                    "APP", "SET", "IPC", "LOG", "PROC", "AGT", "UPD", "WIN", "FS"
                ]
                .contains(&parts[1]),
                "unknown area in {text}"
            );
            assert_eq!(parts[2].len(), 3, "{text}");
            assert!(parts[2].chars().all(|c| c.is_ascii_digit()), "{text}");
        }
    }

    #[test]
    fn codes_are_unique() {
        let codes: Vec<&str> = ErrorCode::iter().map(ErrorCode::as_str).collect();
        let unique: HashSet<&str> = codes.iter().copied().collect();

        assert_eq!(codes.len(), unique.len());
    }

    #[test]
    fn an_error_carries_its_code_a_translation_key_and_optional_details() {
        let error = AppError::new(ErrorCode::WindowsSystemMenu).with_details("handle 1 is invalid");

        assert_eq!(error.code, ErrorCode::WindowsSystemMenu);
        assert_eq!(error.message_key, "errors.ARD-WIN-001");
        assert_eq!(error.details.as_deref(), Some("handle 1 is invalid"));
    }

    #[test]
    fn an_error_reaches_the_ui_in_the_shape_its_types_describe() {
        let error = AppError::new(ErrorCode::Unexpected);

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({ "code": "ARD-APP-001", "messageKey": "errors.ARD-APP-001", "details": null })
        );
    }

    #[test]
    fn prints_its_code_so_logs_and_screenshots_match() {
        let text = AppError::new(ErrorCode::LogsFolder)
            .with_details("access denied")
            .to_string();

        assert_eq!(text, "ARD-LOG-001: access denied");
        assert_eq!(
            AppError::new(ErrorCode::LogsFolder).to_string(),
            "ARD-LOG-001"
        );
    }

    #[test]
    fn the_documented_registry_lists_exactly_the_codes_that_exist() {
        let registry = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../docs/error-codes.md"
        ))
        .expect("docs/error-codes.md exists");
        let documented: HashSet<String> = registry
            .lines()
            .filter_map(|line| line.strip_prefix("| `"))
            .filter_map(|rest| rest.split('`').next())
            .map(str::to_owned)
            .collect();
        let defined: HashSet<String> = ErrorCode::iter()
            .map(|code| code.as_str().to_owned())
            .collect();

        assert_eq!(documented, defined);
    }
}
