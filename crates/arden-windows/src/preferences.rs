//! The Windows settings the UI follows: the regional format (which decides how dates and numbers are
//! written) and the text size (Settings → Accessibility → Text size).
//!
//! The web engine formats by its own UI language and knows nothing of the text size, so Rust reads
//! both and hands them to the UI.

pub use arden_core::preferences::{
    FALLBACK_LOCALE, SystemPreferences, Watcher, normalize_locale, text_scale_percent,
};

/// The Windows version as people say it: `Windows 11 24H2 (build 26100.1234)`. Windows 11 still
/// calls itself "Windows 10" in some places, so the product is told from the build number.
#[must_use]
pub fn describe_windows(build: u32, revision: Option<u32>, release: Option<&str>) -> String {
    let product = if build >= 22_000 {
        "Windows 11"
    } else {
        "Windows 10"
    };
    let release = release.map_or_else(String::new, |release| format!(" {release}"));
    let revision = revision.map_or_else(String::new, |revision| format!(".{revision}"));
    format!("{product}{release} (build {build}{revision})")
}

#[cfg(windows)]
mod system {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;
    use windows::Win32::System::Registry::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ, RegGetValueW,
    };
    use windows::core::w;

    /// The regional format the person chose in Windows, as a language tag. It is read from the key
    /// the watcher listens to, so a read made when Windows signals a change sees that change; the
    /// value Windows keeps for the process is the fallback.
    pub fn locale() -> Option<String> {
        locale_in_registry().or_else(user_default_locale)
    }

    /// `LocaleName` in `HKEY_CURRENT_USER\Control Panel\International`, where Windows writes the
    /// regional format.
    pub fn locale_in_registry() -> Option<String> {
        // LOCALE_NAME_MAX_LENGTH is 85 UTF-16 units, including the ending zero.
        let mut buffer = [0u16; 85];
        let mut size = u32::try_from(size_of_val(&buffer)).ok()?;
        // SAFETY: the buffer is valid for writes and `size` is its size in bytes.
        #[allow(unsafe_code)]
        let result = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Control Panel\\International"),
                w!("LocaleName"),
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&raw mut size),
            )
        };
        if result.is_err() {
            return None;
        }
        // `size` counts bytes, the ending zero included.
        let length = usize::try_from(size).ok()? / 2;
        let text = String::from_utf16(&buffer[..length.saturating_sub(1)]).ok()?;
        (!text.is_empty()).then_some(text)
    }

    /// The user's locale as Windows reports it to the process.
    pub fn user_default_locale() -> Option<String> {
        // LOCALE_NAME_MAX_LENGTH is 85 UTF-16 units, including the ending zero.
        let mut buffer = [0u16; 85];
        // SAFETY: the buffer is valid for writes and its length is passed with it.
        #[allow(unsafe_code)]
        let length = unsafe { GetUserDefaultLocaleName(&mut buffer) };
        let length = usize::try_from(length).ok().filter(|length| *length > 1)?;
        String::from_utf16(&buffer[..length - 1]).ok()
    }

    /// A text value of the current Windows version's registry key.
    fn version_text(name: windows::core::PCWSTR) -> Option<String> {
        let mut buffer = [0u16; 64];
        let mut size = u32::try_from(size_of_val(&buffer)).ok()?;
        // SAFETY: the buffer is valid for writes and `size` is its size in bytes.
        #[allow(unsafe_code)]
        let result = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
                name,
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&raw mut size),
            )
        };
        result.is_ok().then_some(())?;
        let length = usize::try_from(size).ok()? / 2;
        String::from_utf16(&buffer[..length.saturating_sub(1)]).ok()
    }

    /// A number value of the current Windows version's registry key.
    fn version_number(name: windows::core::PCWSTR) -> Option<u32> {
        let mut value = 0u32;
        let mut size = u32::try_from(size_of::<u32>()).ok()?;
        // SAFETY: `value` and `size` are valid for writes and `size` is the size of `value`.
        #[allow(unsafe_code)]
        let result = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
                name,
                RRF_RT_REG_DWORD,
                None,
                Some((&raw mut value).cast()),
                Some(&raw mut size),
            )
        };
        result.is_ok().then_some(value)
    }

    /// The Windows version as text.
    pub fn version() -> Option<String> {
        let build: u32 = version_text(w!("CurrentBuild"))?.parse().ok()?;
        Some(super::describe_windows(
            build,
            version_number(w!("UBR")),
            version_text(w!("DisplayVersion")).as_deref(),
        ))
    }

    /// The text size as Windows stored it, when the person changed it.
    pub fn text_scale() -> Option<u32> {
        let mut value = 0u32;
        let mut size = u32::try_from(size_of::<u32>()).ok()?;
        // SAFETY: `value` and `size` are valid for writes and `size` is the size of `value`.
        #[allow(unsafe_code)]
        let result = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Accessibility"),
                w!("TextScaleFactor"),
                RRF_RT_REG_DWORD,
                None,
                Some((&raw mut value).cast()),
                Some(&raw mut size),
            )
        };
        result.is_ok().then_some(value)
    }
}

/// The Windows version, such as `Windows 11 24H2 (build 26100.1234)`.
#[must_use]
pub fn windows_version() -> String {
    #[cfg(windows)]
    if let Some(version) = system::version() {
        return version;
    }
    "Windows (version unknown)".to_owned()
}

/// Reads the preferences from Windows.
///
/// In debug builds, `ARDEN_CODE_SYSTEM_PREFERENCES_FILE` may name a JSON file that stands in for
/// Windows, so tests can change the text size and the regional format without touching the real
/// settings. Release builds never look at it.
#[must_use]
pub fn read() -> SystemPreferences {
    #[cfg(debug_assertions)]
    if let Some(preferences) = arden_core::preferences::read_stand_in() {
        return preferences;
    }
    read_system()
}

#[cfg(windows)]
fn read_system() -> SystemPreferences {
    SystemPreferences {
        text_scale_percent: text_scale_percent(system::text_scale()),
        locale: system::locale().map_or_else(
            || FALLBACK_LOCALE.to_owned(),
            |name| normalize_locale(&name),
        ),
    }
}

#[cfg(not(windows))]
fn read_system() -> SystemPreferences {
    SystemPreferences::default()
}

/// Where Windows keeps the two settings, under `HKEY_CURRENT_USER`: the text size and the regional
/// format.
#[cfg(windows)]
const KEYS: [&str; 2] = [
    r"Software\Microsoft\Accessibility",
    r"Control Panel\International",
];

/// Calls `on_change` with the preferences when the person changes them in Windows. Nothing runs in
/// between: the watching thread sleeps until Windows says that one of the keys changed. `first` is
/// what the caller already knows; a change that leaves the preferences as they were is not reported,
/// as Windows writes several values for one change of the regional format.
///
/// # Errors
///
/// Returns an error when Windows cannot start the watch.
#[cfg(windows)]
pub fn watch(
    first: SystemPreferences,
    on_change: impl Fn(&SystemPreferences) + Send + 'static,
) -> windows::core::Result<crate::registry::KeyWatcher> {
    crate::registry::KeyWatcher::start_reading(&KEYS, read, first, on_change)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn the_regional_format_in_the_registry_is_the_one_windows_reports() {
        // The watcher reads the registry, so it sees a change as soon as Windows signals it.
        let in_registry = system::locale_in_registry();
        assert!(in_registry.is_some(), "Windows keeps LocaleName");
        assert_eq!(in_registry, system::user_default_locale());
    }

    #[test]
    fn the_windows_version_is_told_as_people_say_it() {
        assert_eq!(
            describe_windows(26100, Some(1234), Some("24H2")),
            "Windows 11 24H2 (build 26100.1234)"
        );
        assert_eq!(
            describe_windows(19045, Some(5000), Some("22H2")),
            "Windows 10 22H2 (build 19045.5000)"
        );
    }

    #[test]
    fn windows_11_is_told_from_the_build_number_although_it_calls_itself_windows_10() {
        assert!(describe_windows(22000, None, None).starts_with("Windows 11"));
        assert!(describe_windows(21999, None, None).starts_with("Windows 10"));
        assert_eq!(
            describe_windows(22631, None, None),
            "Windows 11 (build 22631)"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_answers_with_its_own_version() {
        let version = windows_version();

        assert!(version.starts_with("Windows 1"), "{version}");
        assert!(version.contains("build"), "{version}");
    }

    #[cfg(windows)]
    #[test]
    fn windows_answers_with_a_usable_locale_and_text_size() {
        let preferences = read_system();

        assert_eq!(preferences.locale, normalize_locale(&preferences.locale));
        assert!((100..=225).contains(&preferences.text_scale_percent));
    }
}
