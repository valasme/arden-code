//! The settings and their defaults.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use specta::Type;

/// The version of the settings file this build of Arden Code writes. Whenever the file's shape
/// changes, raise it and add a migration in [`crate::migrate`], with a test.
pub const CURRENT_VERSION: u32 = 1;

/// Zoom, as a percentage.
pub const ZOOM_RANGE: (u16, u16) = (80, 200);
/// The size of code text, in pixels.
pub const CODE_FONT_SIZE_RANGE: (u8, u8) = (11, 20);
/// How wide the sidebar may be, in pixels.
pub const SIDEBAR_WIDTH_RANGE: (u16, u16) = (180, 480);
/// How wide the inspector may be, in pixels.
pub const INSPECTOR_WIDTH_RANGE: (u16, u16) = (240, 640);

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

/// What the app does when it starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "lowercase")]
pub enum OnStartup {
    /// Open the session that was open last time.
    #[default]
    Restore,
    /// Start with no session open.
    Fresh,
}

/// Which regional format dates and numbers are written in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "lowercase")]
pub enum RegionalFormat {
    /// The format chosen in Windows, even when it differs from the language of the interface.
    #[default]
    Windows,
    /// English (US), whatever Windows says.
    English,
}

/// Whether animations play.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "lowercase")]
pub enum ReduceMotion {
    /// Follow the Windows "Show animations" setting.
    #[default]
    System,
    /// Always reduce motion.
    On,
    /// Never reduce motion.
    Off,
}

/// How the app behaves in general.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct General {
    /// Restore the last session, or start fresh.
    pub on_startup: OnStartup,
    /// Look for a new version now and then, without asking.
    pub check_for_updates: bool,
    /// How dates and numbers are written.
    pub regional_format: RegionalFormat,
}

impl Default for General {
    fn default() -> Self {
        Self {
            on_startup: OnStartup::default(),
            check_for_updates: true,
            regional_format: RegionalFormat::default(),
        }
    }
}

/// How the app looks.
// Each switch is a setting of its own that the person turns on or off, not a state to fold into an
// enum.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    /// Light, dark, or follow Windows.
    pub theme: Theme,
    /// How large everything is, from 80 to 200 percent.
    pub zoom: u16,
    /// Make the app larger or smaller with the Windows text size setting, on top of the zoom.
    pub follow_text_size: bool,
    /// The size of code text, from 11 to 20 pixels.
    pub code_font_size: u8,
    /// Join characters such as `=>` into one symbol in code.
    pub code_ligatures: bool,
    /// Play fewer animations.
    pub reduce_motion: ReduceMotion,
    /// Animate scrolling with the wheel and the keyboard. The web engine reads it when it starts.
    pub smooth_scrolling: bool,
    /// Show the bar along the bottom of the window.
    pub show_status_bar: bool,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            zoom: 100,
            follow_text_size: true,
            code_font_size: 13,
            code_ligatures: false,
            reduce_motion: ReduceMotion::default(),
            smooth_scrolling: true,
            show_status_bar: true,
        }
    }
}

/// Whether Arden Code may show Windows notifications.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Notifications {
    /// Show notifications, such as when an agent needs the person. With this off, nothing is shown.
    pub desktop: bool,
}

impl Default for Notifications {
    fn default() -> Self {
        Self { desktop: true }
    }
}

/// How Arden Code works with the agents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Agents {
    /// Ask Claude Code for the 5-hour and weekly usage limits, and show them (ADR 0043). With this
    /// off, Arden Code neither asks nor shows.
    pub show_usage_limits: bool,
}

impl Default for Agents {
    fn default() -> Self {
        Self {
            show_usage_limits: true,
        }
    }
}

/// How wide the side panels were left.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    /// The sidebar's width in pixels.
    pub sidebar_width: u16,
    /// The inspector's width in pixels.
    pub inspector_width: u16,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            sidebar_width: 260,
            inspector_width: 320,
        }
    }
}

/// How much the log files record.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    /// Only what went wrong.
    Error,
    /// What went wrong, and what looks wrong.
    Warn,
    /// The above, and what the app does (the default).
    #[default]
    Info,
    /// Everything, for finding a bug. Files grow faster.
    Debug,
}

/// Settings for people who want to look under the hood.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Advanced {
    /// How much the log files record.
    pub log_level: LogLevel,
    /// Turns on the web engine's developer tools (F12).
    pub developer_mode: bool,
    /// Use the title bar of Windows instead of the one Arden Code draws.
    pub native_title_bar: bool,
    /// Let the graphics card draw the window. Turning it off works around graphics problems and
    /// needs a restart.
    pub hardware_acceleration: bool,
}

impl Default for Advanced {
    fn default() -> Self {
        Self {
            log_level: LogLevel::default(),
            developer_mode: false,
            native_title_bar: false,
            hardware_acceleration: true,
        }
    }
}

/// The most shortcuts one command can have.
pub const MAX_SHORTCUTS_PER_COMMAND: usize = 3;

/// The shortcuts a person changed. A command that is not here has its default shortcuts.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "camelCase")]
pub struct Keyboard {
    /// For each command that was changed, its shortcuts, written like `Ctrl+Shift+P`. An empty
    /// list means the command has no shortcut.
    pub shortcuts: BTreeMap<String, Vec<String>>,
}

/// Whether text is a command id such as `palette.open`.
fn is_command_id(text: &str) -> bool {
    text.len() <= 40
        && text
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic())
        && text
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '.')
}

/// Whether text is a shortcut such as `Ctrl+K`, `Alt+ArrowLeft` or `F11`: any of Ctrl, Alt and
/// Shift, once each, and then a key.
#[must_use]
pub fn is_shortcut(text: &str) -> bool {
    let mut parts: Vec<&str> = text.split('+').collect();
    let Some(key) = parts.pop() else { return false };
    let key_ok = !key.is_empty()
        && !matches!(key, "Ctrl" | "Alt" | "Shift")
        && key.chars().count() <= 20
        && key
            .chars()
            .all(|character| !character.is_whitespace() && !character.is_control());
    let modifiers_ok = parts.iter().enumerate().all(|(index, part)| {
        matches!(*part, "Ctrl" | "Alt" | "Shift") && !parts[..index].contains(part)
    });
    key_ok && modifiers_ok
}

/// Every setting, as stored in `settings.json`. Keys this version does not know are ignored. The
/// store fills in anything missing from a file with its default before reading it into this type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
pub struct Settings {
    /// The version of this file's layout. Written by the app; do not change it by hand.
    pub version: u32,
    pub general: General,
    pub appearance: Appearance,
    pub layout: Layout,
    pub notifications: Notifications,
    pub agents: Agents,
    pub keyboard: Keyboard,
    pub advanced: Advanced,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            general: General::default(),
            appearance: Appearance::default(),
            layout: Layout::default(),
            notifications: Notifications::default(),
            agents: Agents::default(),
            keyboard: Keyboard::default(),
            advanced: Advanced::default(),
        }
    }
}

/// One change to one setting. The UI sends these, so each setting keeps its own type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SettingChange {
    GeneralOnStartup(OnStartup),
    GeneralCheckForUpdates(bool),
    GeneralRegionalFormat(RegionalFormat),
    AppearanceTheme(Theme),
    AppearanceZoom(u16),
    AppearanceFollowTextSize(bool),
    AppearanceCodeFontSize(u8),
    AppearanceCodeLigatures(bool),
    AppearanceReduceMotion(ReduceMotion),
    AppearanceSmoothScrolling(bool),
    AppearanceShowStatusBar(bool),
    LayoutSidebarWidth(u16),
    LayoutInspectorWidth(u16),
    NotificationsDesktop(bool),
    AgentsShowUsageLimits(bool),
    AdvancedLogLevel(LogLevel),
    AdvancedDeveloperMode(bool),
    AdvancedNativeTitleBar(bool),
    AdvancedHardwareAcceleration(bool),
}

/// One setting, named so that it can be reset without saying its value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SettingKey {
    GeneralOnStartup,
    GeneralCheckForUpdates,
    GeneralRegionalFormat,
    AppearanceTheme,
    AppearanceZoom,
    AppearanceFollowTextSize,
    AppearanceCodeFontSize,
    AppearanceCodeLigatures,
    AppearanceReduceMotion,
    AppearanceSmoothScrolling,
    AppearanceShowStatusBar,
    LayoutSidebarWidth,
    LayoutInspectorWidth,
    NotificationsDesktop,
    AgentsShowUsageLimits,
    AdvancedLogLevel,
    AdvancedDeveloperMode,
    AdvancedNativeTitleBar,
    AdvancedHardwareAcceleration,
}

impl SettingKey {
    /// Every setting.
    pub const ALL: [Self; 19] = [
        Self::GeneralOnStartup,
        Self::GeneralCheckForUpdates,
        Self::GeneralRegionalFormat,
        Self::AppearanceTheme,
        Self::AppearanceZoom,
        Self::AppearanceFollowTextSize,
        Self::AppearanceCodeFontSize,
        Self::AppearanceCodeLigatures,
        Self::AppearanceReduceMotion,
        Self::AppearanceSmoothScrolling,
        Self::AppearanceShowStatusBar,
        Self::LayoutSidebarWidth,
        Self::LayoutInspectorWidth,
        Self::NotificationsDesktop,
        Self::AgentsShowUsageLimits,
        Self::AdvancedLogLevel,
        Self::AdvancedDeveloperMode,
        Self::AdvancedNativeTitleBar,
        Self::AdvancedHardwareAcceleration,
    ];
}

impl Settings {
    /// Applies a change to this value. Numbers are kept inside their limits. Saving is up to the
    /// caller.
    pub fn apply(&mut self, change: SettingChange) {
        match change {
            SettingChange::GeneralOnStartup(value) => self.general.on_startup = value,
            SettingChange::GeneralCheckForUpdates(value) => self.general.check_for_updates = value,
            SettingChange::GeneralRegionalFormat(value) => self.general.regional_format = value,
            SettingChange::AppearanceTheme(value) => self.appearance.theme = value,
            SettingChange::AppearanceZoom(value) => self.appearance.zoom = value,
            SettingChange::AppearanceFollowTextSize(value) => {
                self.appearance.follow_text_size = value;
            }
            SettingChange::AppearanceCodeFontSize(value) => self.appearance.code_font_size = value,
            SettingChange::AppearanceCodeLigatures(value) => self.appearance.code_ligatures = value,
            SettingChange::AppearanceReduceMotion(value) => self.appearance.reduce_motion = value,
            SettingChange::AppearanceSmoothScrolling(value) => {
                self.appearance.smooth_scrolling = value;
            }
            SettingChange::AppearanceShowStatusBar(value) => {
                self.appearance.show_status_bar = value;
            }
            SettingChange::LayoutSidebarWidth(value) => self.layout.sidebar_width = value,
            SettingChange::LayoutInspectorWidth(value) => self.layout.inspector_width = value,
            SettingChange::NotificationsDesktop(value) => self.notifications.desktop = value,
            SettingChange::AgentsShowUsageLimits(value) => self.agents.show_usage_limits = value,
            SettingChange::AdvancedLogLevel(value) => self.advanced.log_level = value,
            SettingChange::AdvancedDeveloperMode(value) => self.advanced.developer_mode = value,
            SettingChange::AdvancedNativeTitleBar(value) => self.advanced.native_title_bar = value,
            SettingChange::AdvancedHardwareAcceleration(value) => {
                self.advanced.hardware_acceleration = value;
            }
        }
        self.clamp();
    }

    /// Sets the shortcuts of one command. An empty list gives it no shortcut. Anything that is not a
    /// shortcut is left out, and so is everything past the most a command can have.
    pub fn set_shortcuts(&mut self, command: &str, shortcuts: &[String]) {
        if !is_command_id(command) {
            return;
        }
        let mut kept: Vec<String> = Vec::new();
        for shortcut in shortcuts {
            if is_shortcut(shortcut) && !kept.contains(shortcut) {
                kept.push(shortcut.clone());
            }
        }
        kept.truncate(MAX_SHORTCUTS_PER_COMMAND);
        self.keyboard.shortcuts.insert(command.to_owned(), kept);
    }

    /// Gives one command its default shortcuts again, or every command when `command` is `None`.
    pub fn reset_shortcuts(&mut self, command: Option<&str>) {
        match command {
            Some(command) => {
                self.keyboard.shortcuts.remove(command);
            }
            None => self.keyboard.shortcuts.clear(),
        }
    }

    /// Puts one setting back to its default.
    pub fn reset(&mut self, key: SettingKey) {
        let defaults = Self::default();
        match key {
            SettingKey::GeneralOnStartup => self.general.on_startup = defaults.general.on_startup,
            SettingKey::GeneralCheckForUpdates => {
                self.general.check_for_updates = defaults.general.check_for_updates;
            }
            SettingKey::GeneralRegionalFormat => {
                self.general.regional_format = defaults.general.regional_format;
            }
            SettingKey::AppearanceTheme => self.appearance.theme = defaults.appearance.theme,
            SettingKey::AppearanceZoom => self.appearance.zoom = defaults.appearance.zoom,
            SettingKey::AppearanceFollowTextSize => {
                self.appearance.follow_text_size = defaults.appearance.follow_text_size;
            }
            SettingKey::AppearanceCodeFontSize => {
                self.appearance.code_font_size = defaults.appearance.code_font_size;
            }
            SettingKey::AppearanceCodeLigatures => {
                self.appearance.code_ligatures = defaults.appearance.code_ligatures;
            }
            SettingKey::AppearanceReduceMotion => {
                self.appearance.reduce_motion = defaults.appearance.reduce_motion;
            }
            SettingKey::AppearanceSmoothScrolling => {
                self.appearance.smooth_scrolling = defaults.appearance.smooth_scrolling;
            }
            SettingKey::AppearanceShowStatusBar => {
                self.appearance.show_status_bar = defaults.appearance.show_status_bar;
            }
            SettingKey::LayoutSidebarWidth => {
                self.layout.sidebar_width = defaults.layout.sidebar_width;
            }
            SettingKey::LayoutInspectorWidth => {
                self.layout.inspector_width = defaults.layout.inspector_width;
            }
            SettingKey::NotificationsDesktop => {
                self.notifications.desktop = defaults.notifications.desktop;
            }
            SettingKey::AgentsShowUsageLimits => {
                self.agents.show_usage_limits = defaults.agents.show_usage_limits;
            }
            SettingKey::AdvancedLogLevel => self.advanced.log_level = defaults.advanced.log_level,
            SettingKey::AdvancedDeveloperMode => {
                self.advanced.developer_mode = defaults.advanced.developer_mode;
            }
            SettingKey::AdvancedNativeTitleBar => {
                self.advanced.native_title_bar = defaults.advanced.native_title_bar;
            }
            SettingKey::AdvancedHardwareAcceleration => {
                self.advanced.hardware_acceleration = defaults.advanced.hardware_acceleration;
            }
        }
    }

    /// Brings every number back inside its limits. A hand-edited file may hold any number; the app
    /// takes the nearest allowed one instead of refusing the whole file.
    pub fn clamp(&mut self) {
        self.appearance.zoom = self.appearance.zoom.clamp(ZOOM_RANGE.0, ZOOM_RANGE.1);
        self.appearance.code_font_size = self
            .appearance
            .code_font_size
            .clamp(CODE_FONT_SIZE_RANGE.0, CODE_FONT_SIZE_RANGE.1);
        self.layout.sidebar_width = self
            .layout
            .sidebar_width
            .clamp(SIDEBAR_WIDTH_RANGE.0, SIDEBAR_WIDTH_RANGE.1);
        self.layout.inspector_width = self
            .layout
            .inspector_width
            .clamp(INSPECTOR_WIDTH_RANGE.0, INSPECTOR_WIDTH_RANGE.1);
        // A hand-edited shortcut that is not one is dropped, the rest of the file is kept.
        let changed = std::mem::take(&mut self.keyboard.shortcuts);
        for (command, shortcuts) in changed {
            self.set_shortcuts(&command, &shortcuts);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_are_the_ones_in_the_plan() {
        let settings = Settings::default();

        assert_eq!(settings.version, CURRENT_VERSION);
        assert_eq!(settings.general.on_startup, OnStartup::Restore);
        assert!(settings.general.check_for_updates);
        assert_eq!(settings.general.regional_format, RegionalFormat::Windows);
        assert_eq!(settings.appearance.theme, Theme::System);
        assert_eq!(settings.appearance.zoom, 100);
        assert!(settings.appearance.follow_text_size);
        assert_eq!(settings.appearance.code_font_size, 13);
        assert!(!settings.appearance.code_ligatures);
        assert_eq!(settings.appearance.reduce_motion, ReduceMotion::System);
        assert!(settings.appearance.smooth_scrolling);
        assert!(settings.appearance.show_status_bar);
        assert!(settings.notifications.desktop);
        assert!(settings.agents.show_usage_limits);
        assert_eq!(settings.advanced.log_level, LogLevel::Info);
        assert!(!settings.advanced.developer_mode);
        assert!(!settings.advanced.native_title_bar);
        assert!(settings.advanced.hardware_acceleration);
    }

    #[test]
    fn are_written_the_way_a_person_would_write_them() {
        let value = serde_json::to_value(Settings::default()).unwrap();

        assert_eq!(
            value,
            serde_json::json!({
                "version": 1,
                "general": {
                    "onStartup": "restore",
                    "checkForUpdates": true,
                    "regionalFormat": "windows"
                },
                "appearance": {
                    "theme": "system",
                    "zoom": 100,
                    "followTextSize": true,
                    "codeFontSize": 13,
                    "codeLigatures": false,
                    "reduceMotion": "system",
                    "smoothScrolling": true,
                    "showStatusBar": true
                },
                "layout": { "sidebarWidth": 260, "inspectorWidth": 320 },
                "notifications": { "desktop": true },
                "agents": { "showUsageLimits": true },
                "keyboard": { "shortcuts": {} },
                "advanced": {
                    "logLevel": "info",
                    "developerMode": false,
                    "nativeTitleBar": false,
                    "hardwareAcceleration": true
                }
            })
        );
    }

    #[test]
    fn a_change_replaces_only_its_own_setting() {
        let mut settings = Settings::default();

        settings.apply(SettingChange::AppearanceTheme(Theme::Dark));

        let mut expected = Settings::default();
        expected.appearance.theme = Theme::Dark;
        assert_eq!(settings, expected);
    }

    #[test]
    fn every_change_reaches_its_setting() {
        let mut settings = Settings::default();

        settings.apply(SettingChange::GeneralOnStartup(OnStartup::Fresh));
        settings.apply(SettingChange::GeneralCheckForUpdates(false));
        settings.apply(SettingChange::GeneralRegionalFormat(
            RegionalFormat::English,
        ));
        settings.apply(SettingChange::AppearanceZoom(150));
        settings.apply(SettingChange::AppearanceFollowTextSize(false));
        settings.apply(SettingChange::AppearanceCodeFontSize(16));
        settings.apply(SettingChange::AppearanceCodeLigatures(true));
        settings.apply(SettingChange::AppearanceReduceMotion(ReduceMotion::On));
        settings.apply(SettingChange::AppearanceSmoothScrolling(false));
        settings.apply(SettingChange::AppearanceShowStatusBar(false));
        settings.apply(SettingChange::LayoutSidebarWidth(300));
        settings.apply(SettingChange::LayoutInspectorWidth(400));
        settings.apply(SettingChange::NotificationsDesktop(false));
        settings.apply(SettingChange::AgentsShowUsageLimits(false));
        settings.apply(SettingChange::AdvancedLogLevel(LogLevel::Debug));
        settings.apply(SettingChange::AdvancedDeveloperMode(true));
        settings.apply(SettingChange::AdvancedNativeTitleBar(true));
        settings.apply(SettingChange::AdvancedHardwareAcceleration(false));

        assert!(!settings.agents.show_usage_limits);
        assert_eq!(settings.advanced.log_level, LogLevel::Debug);
        assert!(settings.advanced.developer_mode);
        assert!(settings.advanced.native_title_bar);
        assert!(!settings.advanced.hardware_acceleration);
        assert_eq!(settings.general.on_startup, OnStartup::Fresh);
        assert!(!settings.general.check_for_updates);
        assert_eq!(settings.general.regional_format, RegionalFormat::English);
        assert!(!settings.appearance.follow_text_size);
        assert_eq!(settings.appearance.zoom, 150);
        assert_eq!(settings.appearance.code_font_size, 16);
        assert!(settings.appearance.code_ligatures);
        assert_eq!(settings.appearance.reduce_motion, ReduceMotion::On);
        assert!(!settings.appearance.smooth_scrolling);
        assert!(!settings.appearance.show_status_bar);
        assert_eq!(settings.layout.sidebar_width, 300);
        assert_eq!(settings.layout.inspector_width, 400);
        assert!(!settings.notifications.desktop);
    }

    #[test]
    fn numbers_stay_inside_their_limits() {
        let mut settings = Settings::default();

        settings.apply(SettingChange::AppearanceZoom(500));
        assert_eq!(settings.appearance.zoom, 200);
        settings.apply(SettingChange::AppearanceZoom(10));
        assert_eq!(settings.appearance.zoom, 80);
        settings.apply(SettingChange::AppearanceCodeFontSize(30));
        assert_eq!(settings.appearance.code_font_size, 20);
        settings.apply(SettingChange::AppearanceCodeFontSize(2));
        assert_eq!(settings.appearance.code_font_size, 11);
        settings.apply(SettingChange::LayoutSidebarWidth(5000));
        assert_eq!(settings.layout.sidebar_width, 480);
        settings.apply(SettingChange::LayoutInspectorWidth(1));
        assert_eq!(settings.layout.inspector_width, 240);
    }

    #[test]
    fn a_hand_edited_number_out_of_range_is_brought_back_inside() {
        let mut settings = Settings::default();
        settings.appearance.zoom = 999;
        settings.appearance.code_font_size = 0;
        settings.layout.sidebar_width = 0;

        settings.clamp();

        assert_eq!(settings.appearance.zoom, 200);
        assert_eq!(settings.appearance.code_font_size, 11);
        assert_eq!(settings.layout.sidebar_width, 180);
    }

    /// A settings value with every setting away from its default.
    fn all_changed() -> Settings {
        let mut settings = Settings::default();
        settings.apply(SettingChange::GeneralOnStartup(OnStartup::Fresh));
        settings.apply(SettingChange::GeneralCheckForUpdates(false));
        settings.apply(SettingChange::GeneralRegionalFormat(
            RegionalFormat::English,
        ));
        settings.apply(SettingChange::AppearanceTheme(Theme::Dark));
        settings.apply(SettingChange::AppearanceZoom(150));
        settings.apply(SettingChange::AppearanceFollowTextSize(false));
        settings.apply(SettingChange::AppearanceCodeFontSize(16));
        settings.apply(SettingChange::AppearanceCodeLigatures(true));
        settings.apply(SettingChange::AppearanceReduceMotion(ReduceMotion::On));
        settings.apply(SettingChange::AppearanceSmoothScrolling(false));
        settings.apply(SettingChange::AppearanceShowStatusBar(false));
        settings.apply(SettingChange::LayoutSidebarWidth(300));
        settings.apply(SettingChange::LayoutInspectorWidth(400));
        settings.apply(SettingChange::NotificationsDesktop(false));
        settings.apply(SettingChange::AgentsShowUsageLimits(false));
        settings.apply(SettingChange::AdvancedLogLevel(LogLevel::Debug));
        settings.apply(SettingChange::AdvancedDeveloperMode(true));
        settings.apply(SettingChange::AdvancedNativeTitleBar(true));
        settings.apply(SettingChange::AdvancedHardwareAcceleration(false));
        settings
    }

    #[test]
    fn a_setting_can_be_reset_on_its_own() {
        let mut settings = all_changed();

        settings.reset(SettingKey::AppearanceZoom);

        let mut expected = all_changed();
        expected.appearance.zoom = 100;
        assert_eq!(settings, expected, "the others are left alone");
    }

    #[test]
    fn every_setting_can_be_reset_and_each_reset_changes_exactly_one() {
        let changed = all_changed();
        for key in SettingKey::ALL {
            let mut settings = changed.clone();

            settings.reset(key);

            let json = |value: &Settings| serde_json::to_value(value).unwrap();
            let (before, after) = (json(&changed), json(&settings));
            let mut differing = 0;
            for (group, fields) in before.as_object().unwrap() {
                if let Some(fields) = fields.as_object() {
                    for (field, value) in fields {
                        if after[group][field] != *value {
                            differing += 1;
                        }
                    }
                }
            }
            assert_eq!(differing, 1, "{key:?} resets exactly one setting");
        }
    }

    #[test]
    fn shortcuts_are_written_like_people_write_them() {
        for good in [
            "Ctrl+K",
            "Ctrl+Shift+P",
            "Alt+ArrowLeft",
            "F11",
            "Ctrl+,",
            "Ctrl+/",
            "Shift+F10",
        ] {
            assert!(is_shortcut(good), "{good}");
        }
        for bad in [
            "",
            "+",
            "Ctrl+",
            "Ctrl+Ctrl+K",
            "Meta+K",
            "ctrl+k ",
            "Ctrl+K L",
            "Ctrl+\u{7}",
            "Ctrl++",
            "Ctrl+Shift",
            "Ctrl+waytoolongakeynamethatisnotakey",
        ] {
            assert!(!is_shortcut(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_shortcut_can_be_set_for_one_command() {
        let mut settings = Settings::default();

        settings.set_shortcuts("palette.open", &["Ctrl+Shift+O".to_owned()]);

        assert_eq!(
            settings.keyboard.shortcuts["palette.open"],
            ["Ctrl+Shift+O"]
        );
        assert_eq!(settings.keyboard.shortcuts.len(), 1);
    }

    #[test]
    fn a_command_can_be_left_without_a_shortcut() {
        let mut settings = Settings::default();

        settings.set_shortcuts("sidebar.toggle", &[]);

        assert_eq!(
            settings.keyboard.shortcuts["sidebar.toggle"],
            Vec::<String>::new()
        );
    }

    #[test]
    fn what_is_not_a_shortcut_is_left_out_and_a_command_keeps_at_most_three() {
        let mut settings = Settings::default();

        settings.set_shortcuts(
            "palette.open",
            &[
                "Ctrl+K".to_owned(),
                "not a shortcut".to_owned(),
                "Ctrl+K".to_owned(),
                "Ctrl+1".to_owned(),
                "Ctrl+2".to_owned(),
                "Ctrl+3".to_owned(),
            ],
        );
        settings.set_shortcuts("no spaces allowed", &["Ctrl+9".to_owned()]);
        settings.set_shortcuts("", &["Ctrl+9".to_owned()]);

        assert_eq!(
            settings.keyboard.shortcuts["palette.open"],
            ["Ctrl+K", "Ctrl+1", "Ctrl+2"]
        );
        assert_eq!(settings.keyboard.shortcuts.len(), 1);
    }

    #[test]
    fn one_command_or_all_of_them_can_go_back_to_their_defaults() {
        let mut settings = Settings::default();
        settings.set_shortcuts("palette.open", &["Ctrl+Shift+O".to_owned()]);
        settings.set_shortcuts("sidebar.toggle", &[]);

        settings.reset_shortcuts(Some("palette.open"));
        assert!(!settings.keyboard.shortcuts.contains_key("palette.open"));
        assert!(settings.keyboard.shortcuts.contains_key("sidebar.toggle"));

        settings.reset_shortcuts(None);
        assert!(settings.keyboard.shortcuts.is_empty());
    }

    #[test]
    fn a_hand_edited_shortcut_that_is_not_one_is_dropped_and_the_rest_kept() {
        let mut settings = Settings::default();
        settings.keyboard.shortcuts.insert(
            "palette.open".to_owned(),
            vec!["Ctrl+K".to_owned(), "nonsense++".to_owned()],
        );
        settings
            .keyboard
            .shortcuts
            .insert("bad id!".to_owned(), vec!["Ctrl+B".to_owned()]);

        settings.clamp();

        assert_eq!(settings.keyboard.shortcuts.len(), 1);
        assert_eq!(settings.keyboard.shortcuts["palette.open"], ["Ctrl+K"]);
    }

    #[test]
    fn unknown_keys_are_ignored_so_a_schema_reference_or_a_future_setting_does_no_harm() {
        let settings: Settings = serde_json::from_str(
            r#"{"$schema":"./settings.schema.json","version":1,"general":{"onStartup":"restore","checkForUpdates":true,"regionalFormat":"windows","future":1},"appearance":{"theme":"dark","zoom":100,"followTextSize":true,"codeFontSize":13,"codeLigatures":false,"reduceMotion":"system","smoothScrolling":true,"showStatusBar":true},"layout":{"sidebarWidth":260,"inspectorWidth":320},"notifications":{"desktop":true},"agents":{"showUsageLimits":true},"keyboard":{"shortcuts":{}},"advanced":{"logLevel":"info","developerMode":false,"nativeTitleBar":false,"hardwareAcceleration":true},"extra":1}"#,
        )
        .unwrap();

        assert_eq!(settings.appearance.theme, Theme::Dark);
    }

    #[test]
    fn a_value_that_does_not_exist_is_an_error() {
        let text =
            |group: &str, key: &str, value: &str| format!(r#"{{"{group}":{{"{key}":{value}}}}}"#);
        for bad in [
            text("appearance", "theme", r#""purple""#),
            text("general", "onStartup", r#""sometimes""#),
            text("appearance", "reduceMotion", r#""maybe""#),
            text("general", "regionalFormat", r#""klingon""#),
            text("advanced", "logLevel", r#""shouting""#),
        ] {
            assert!(serde_json::from_str::<Settings>(&bad).is_err(), "{bad}");
        }
    }
}
