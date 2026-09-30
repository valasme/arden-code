//! The settings and their defaults.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use specta::Type;

/// The version of the settings file this build of Arden Code writes. Whenever the file's shape
/// changes, raise it and add a migration in [`crate::migrate`], with a test.
pub const CURRENT_VERSION: u32 = 1;

/// Which color scheme the window uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Follow the Windows light or dark setting.
    #[default]
    System,
    Light,
    Dark,
}

/// How the app looks.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
pub struct Appearance {
    /// Light, dark, or follow Windows.
    pub theme: Theme,
}

/// Every setting, as stored in `settings.json`. Keys this version does not know are ignored. The
/// store fills in anything missing from a file with its default before reading it into this type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
pub struct Settings {
    /// The version of this file's layout. Written by the app; do not change it by hand.
    pub version: u32,
    pub appearance: Appearance,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            appearance: Appearance::default(),
        }
    }
}

/// One change to one setting. The UI sends these, so each setting keeps its own type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SettingChange {
    AppearanceTheme(Theme),
}

impl Settings {
    /// Applies a change to this value. Saving is up to the caller.
    pub fn apply(&mut self, change: SettingChange) {
        match change {
            SettingChange::AppearanceTheme(theme) => self.appearance.theme = theme,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_follow_windows() {
        let settings = Settings::default();

        assert_eq!(settings.version, CURRENT_VERSION);
        assert_eq!(settings.appearance.theme, Theme::System);
    }

    #[test]
    fn are_written_the_way_a_person_would_write_them() {
        let text = serde_json::to_string(&Settings::default()).unwrap();

        assert_eq!(text, r#"{"version":1,"appearance":{"theme":"system"}}"#);
    }

    #[test]
    fn a_change_replaces_only_its_own_setting() {
        let mut settings = Settings::default();

        settings.apply(SettingChange::AppearanceTheme(Theme::Dark));

        assert_eq!(settings.appearance.theme, Theme::Dark);
        assert_eq!(settings.version, CURRENT_VERSION);
    }

    #[test]
    fn unknown_keys_are_ignored_so_a_schema_reference_or_a_future_setting_does_no_harm() {
        let settings: Settings = serde_json::from_str(
            r#"{"$schema":"./settings.schema.json","version":1,"appearance":{"theme":"dark","future":true},"extra":1}"#,
        )
        .unwrap();

        assert_eq!(settings.appearance.theme, Theme::Dark);
    }

    #[test]
    fn a_theme_that_does_not_exist_is_an_error() {
        assert!(serde_json::from_str::<Settings>(r#"{"appearance":{"theme":"purple"}}"#).is_err());
    }
}
