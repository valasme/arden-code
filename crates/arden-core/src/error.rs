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
    /// Arden Code could not get ready to reset itself.
    #[serde(rename = "ARD-APP-003")]
    ResetApp,
    /// A link was not opened: it is not allowed, or Windows could not open it.
    #[serde(rename = "ARD-APP-004")]
    LinkNotOpened,
    /// A notification could not be shown.
    #[serde(rename = "ARD-APP-005")]
    NotificationNotShown,
    /// A reset could not finish, so the settings were kept and the next start tries again.
    #[serde(rename = "ARD-APP-006")]
    ResetUnfinished,
    /// The settings could not be saved.
    #[serde(rename = "ARD-SET-001")]
    SettingsSave,
    /// The settings file was not valid, so the defaults are in use.
    #[serde(rename = "ARD-SET-002")]
    SettingsInvalid,
    /// A settings file could not be imported.
    #[serde(rename = "ARD-SET-003")]
    SettingsImport,
    /// The settings could not be exported.
    #[serde(rename = "ARD-SET-004")]
    SettingsExport,
    /// `settings.json` could not be opened.
    #[serde(rename = "ARD-SET-005")]
    SettingsOpen,
    /// The logs folder could not be opened.
    #[serde(rename = "ARD-LOG-001")]
    LogsFolder,
    /// The diagnostics bundle could not be written.
    #[serde(rename = "ARD-LOG-002")]
    DiagnosticsExport,
    /// A session or project does not exist any more.
    #[serde(rename = "ARD-AGT-001")]
    SessionNotFound,
    /// A message was sent while the agent was still answering the last one.
    #[serde(rename = "ARD-AGT-002")]
    TurnRunning,
    /// The sessions could not be saved, so they last only until Arden Code closes.
    #[serde(rename = "ARD-AGT-003")]
    SessionsNotSaved,
    /// The saved sessions could not be read, so Arden Code started without them.
    #[serde(rename = "ARD-AGT-004")]
    SessionsUnreadable,
    /// The session is archived, so it takes no message, name or pin until it is unarchived.
    #[serde(rename = "ARD-AGT-005")]
    SessionArchived,
    /// A name given to a session is empty or too long.
    #[serde(rename = "ARD-AGT-006")]
    SessionNameInvalid,
    /// Claude Code (`claude`) was not found, so Claude cannot start.
    #[serde(rename = "ARD-AGT-007")]
    ClaudeNotInstalled,
    /// The installed Claude Code is older than the minimum version.
    #[serde(rename = "ARD-AGT-008")]
    ClaudeTooOld,
    /// Claude Code is not signed in.
    #[serde(rename = "ARD-AGT-009")]
    ClaudeSignedOut,
    /// Claude Code could not start, or stopped in the middle of a reply.
    #[serde(rename = "ARD-AGT-010")]
    ClaudeStopped,
    /// Claude Code answered in a way Arden Code does not understand.
    #[serde(rename = "ARD-AGT-011")]
    ClaudeNotUnderstood,
    /// Only npm's claude.cmd was found, with no Claude Code program beside it.
    #[serde(rename = "ARD-AGT-012")]
    ClaudeNpmWrapper,
    /// Claude could not answer, for a reason Claude Code gave.
    #[serde(rename = "ARD-AGT-013")]
    ClaudeCouldNotAnswer,
    /// A session's agent or project was to change after its first message.
    #[serde(rename = "ARD-AGT-014")]
    SessionNotEmpty,
    /// An approval request was answered when it no longer waited for an answer.
    #[serde(rename = "ARD-AGT-015")]
    RequestNotWaiting,
    /// Claude was asked to work in a project whose folder the person has not trusted.
    #[serde(rename = "ARD-AGT-016")]
    ProjectNotTrusted,
    /// The Playground was to be removed; it always stays.
    #[serde(rename = "ARD-AGT-017")]
    PlaygroundStays,
    /// The agent refused the permission mode chosen, and kept the one it was in.
    #[serde(rename = "ARD-AGT-018")]
    PermissionModeRefused,
    /// Bypass permissions was chosen while Settings does not allow it.
    #[serde(rename = "ARD-AGT-019")]
    BypassNotAllowed,
    /// Programs cannot be started and supervised on this computer.
    #[serde(rename = "ARD-PROC-001")]
    ProcessSupervisor,
    /// The update could not be installed.
    #[serde(rename = "ARD-UPD-001")]
    UpdateInstall,
    /// Windows' window menu could not be opened.
    #[serde(rename = "ARD-WIN-001")]
    WindowsSystemMenu,
    /// The web engine that draws the window stopped and was started again.
    #[serde(rename = "ARD-WIN-002")]
    WebEngineFailed,
}

impl ErrorCode {
    /// The code as written, such as `ARD-WIN-001`.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unexpected => "ARD-APP-001",
            Self::UiFailure => "ARD-APP-002",
            Self::ResetApp => "ARD-APP-003",
            Self::LinkNotOpened => "ARD-APP-004",
            Self::NotificationNotShown => "ARD-APP-005",
            Self::ResetUnfinished => "ARD-APP-006",
            Self::SettingsSave => "ARD-SET-001",
            Self::SettingsInvalid => "ARD-SET-002",
            Self::SettingsImport => "ARD-SET-003",
            Self::SettingsExport => "ARD-SET-004",
            Self::SettingsOpen => "ARD-SET-005",
            Self::LogsFolder => "ARD-LOG-001",
            Self::DiagnosticsExport => "ARD-LOG-002",
            Self::SessionNotFound => "ARD-AGT-001",
            Self::TurnRunning => "ARD-AGT-002",
            Self::SessionsNotSaved => "ARD-AGT-003",
            Self::SessionsUnreadable => "ARD-AGT-004",
            Self::SessionArchived => "ARD-AGT-005",
            Self::SessionNameInvalid => "ARD-AGT-006",
            Self::ClaudeNotInstalled => "ARD-AGT-007",
            Self::ClaudeTooOld => "ARD-AGT-008",
            Self::ClaudeSignedOut => "ARD-AGT-009",
            Self::ClaudeStopped => "ARD-AGT-010",
            Self::ClaudeNotUnderstood => "ARD-AGT-011",
            Self::ClaudeNpmWrapper => "ARD-AGT-012",
            Self::ClaudeCouldNotAnswer => "ARD-AGT-013",
            Self::SessionNotEmpty => "ARD-AGT-014",
            Self::RequestNotWaiting => "ARD-AGT-015",
            Self::ProjectNotTrusted => "ARD-AGT-016",
            Self::PlaygroundStays => "ARD-AGT-017",
            Self::PermissionModeRefused => "ARD-AGT-018",
            Self::BypassNotAllowed => "ARD-AGT-019",
            Self::ProcessSupervisor => "ARD-PROC-001",
            Self::UpdateInstall => "ARD-UPD-001",
            Self::WindowsSystemMenu => "ARD-WIN-001",
            Self::WebEngineFailed => "ARD-WIN-002",
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
