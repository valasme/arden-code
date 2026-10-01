//! The Windows settings the UI follows: the regional format (which decides how dates and numbers are
//! written) and the text size (Settings → Accessibility → Text size).
//!
//! The web engine formats by its own UI language and knows nothing of the text size, so Rust reads
//! both and hands them to the UI.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// The locale to use when Windows gives none that can be used.
pub const FALLBACK_LOCALE: &str = "en-US";

/// Windows' text size setting runs from 100% to 225%.
const TEXT_SCALE_RANGE: (u16, u16) = (100, 225);

/// What the UI needs to know about the system.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPreferences {
    /// The text size as a percentage: 100 is the normal size.
    pub text_scale_percent: u16,
    /// The regional format as a language tag such as `el-GR` or `en-GB`.
    pub locale: String,
}

impl Default for SystemPreferences {
    fn default() -> Self {
        Self {
            text_scale_percent: TEXT_SCALE_RANGE.0,
            locale: FALLBACK_LOCALE.to_owned(),
        }
    }
}

/// The text size from what Windows stored: a percentage, or nothing when the person never changed it.
#[must_use]
pub fn text_scale_percent(stored: Option<u32>) -> u16 {
    let percent = stored.unwrap_or(u32::from(TEXT_SCALE_RANGE.0));
    u16::try_from(percent)
        .unwrap_or(TEXT_SCALE_RANGE.1)
        .clamp(TEXT_SCALE_RANGE.0, TEXT_SCALE_RANGE.1)
}

/// A language tag the UI can pass to `Intl`, from the name Windows gave. Anything that is not a
/// plausible tag (empty, or with characters a tag cannot have) becomes [`FALLBACK_LOCALE`].
#[must_use]
pub fn normalize_locale(name: &str) -> String {
    let name = name.trim();
    let is_tag = !name.is_empty()
        && name.split('-').all(|part| {
            (1..=8).contains(&part.len()) && part.chars().all(|c| c.is_ascii_alphanumeric())
        })
        && name.split('-').next().is_some_and(|language| {
            (2..=3).contains(&language.len()) && language.chars().all(|c| c.is_ascii_alphabetic())
        });
    if is_tag {
        name.to_owned()
    } else {
        FALLBACK_LOCALE.to_owned()
    }
}

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
    if let Some(preferences) = read_stand_in() {
        return preferences;
    }
    read_system()
}

#[cfg(debug_assertions)]
fn read_stand_in() -> Option<SystemPreferences> {
    let path = std::env::var_os("ARDEN_CODE_SYSTEM_PREFERENCES_FILE")?;
    let text = std::fs::read_to_string(path).ok()?;
    let mut preferences: SystemPreferences = serde_json::from_str(&text).ok()?;
    preferences.text_scale_percent =
        text_scale_percent(Some(u32::from(preferences.text_scale_percent)));
    preferences.locale = normalize_locale(&preferences.locale);
    Some(preferences)
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

/// Calls a function whenever a value that is read on a timer changes. The thread ends when this is
/// dropped. Only the stand-in file of debug builds is watched this way; Windows itself is watched
/// with [`watch`], which needs no timer.
pub struct Watcher {
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Watcher {
    /// Reads `read` every `interval`, and calls `on_change` with the new value when it differs from
    /// the last one. `first` is what the caller already knows.
    pub fn start<T>(
        first: T,
        interval: Duration,
        read: impl Fn() -> T + Send + 'static,
        on_change: impl Fn(&T) + Send + 'static,
    ) -> Self
    where
        T: PartialEq + Send + 'static,
    {
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&stop);
        let thread = thread::spawn(move || {
            let mut last = first;
            while !stopped.load(Ordering::Relaxed) {
                thread::sleep(interval);
                let now = read();
                if now != last {
                    on_change(&now);
                    last = now;
                }
            }
        });
        Self {
            stop,
            thread: Mutex::new(Some(thread)),
        }
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut thread) = self.thread.lock()
            && let Some(thread) = thread.take()
        {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU16;
    use std::sync::mpsc;

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
    fn the_text_size_is_a_percentage_from_100_to_225() {
        assert_eq!(text_scale_percent(None), 100, "never changed means normal");
        assert_eq!(text_scale_percent(Some(100)), 100);
        assert_eq!(text_scale_percent(Some(150)), 150);
        assert_eq!(text_scale_percent(Some(225)), 225);
    }

    #[test]
    fn a_text_size_outside_what_windows_offers_is_brought_inside() {
        assert_eq!(text_scale_percent(Some(0)), 100);
        assert_eq!(text_scale_percent(Some(50)), 100);
        assert_eq!(text_scale_percent(Some(400)), 225);
        assert_eq!(text_scale_percent(Some(u32::MAX)), 225);
    }

    #[test]
    fn a_regional_format_is_a_language_tag() {
        assert_eq!(normalize_locale("el-GR"), "el-GR");
        assert_eq!(normalize_locale("en-GB"), "en-GB");
        assert_eq!(normalize_locale("sr-Latn-RS"), "sr-Latn-RS");
        assert_eq!(normalize_locale("de"), "de");
        assert_eq!(normalize_locale("  fr-CA "), "fr-CA");
        assert_eq!(normalize_locale("zh-Hans-CN"), "zh-Hans-CN");
    }

    #[test]
    fn anything_that_is_not_a_language_tag_becomes_english_us() {
        for bad in [
            "",
            "   ",
            "en_US",
            "x",
            "12-34",
            "en--US",
            "-US",
            "en-US-",
            "en-<script>",
            "en-US\u{0}",
            "waytoolonglanguage-XX",
        ] {
            assert_eq!(normalize_locale(bad), "en-US", "{bad:?}");
        }
    }

    #[test]
    fn the_defaults_are_normal_size_and_english_us() {
        assert_eq!(
            SystemPreferences::default(),
            SystemPreferences {
                text_scale_percent: 100,
                locale: "en-US".to_owned()
            }
        );
    }

    #[test]
    fn are_written_the_way_the_ui_reads_them() {
        let text = serde_json::to_string(&SystemPreferences {
            text_scale_percent: 125,
            locale: "el-GR".to_owned(),
        })
        .unwrap();

        assert_eq!(text, r#"{"textScalePercent":125,"locale":"el-GR"}"#);
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

    #[test]
    fn a_watcher_reports_a_change_once_and_ignores_a_value_that_stays() {
        let value = Arc::new(AtomicU16::new(100));
        let (send, receive) = mpsc::channel();
        let read_value = Arc::clone(&value);
        let _watcher = Watcher::start(
            100,
            Duration::from_millis(10),
            move || read_value.load(Ordering::Relaxed),
            move |now| {
                send.send(*now).unwrap();
            },
        );

        thread::sleep(Duration::from_millis(60));
        assert!(receive.try_recv().is_err(), "nothing changed yet");
        value.store(150, Ordering::Relaxed);

        assert_eq!(receive.recv_timeout(Duration::from_secs(2)).unwrap(), 150);
        thread::sleep(Duration::from_millis(60));
        assert!(
            receive.try_recv().is_err(),
            "the same value is not reported twice"
        );
    }

    #[test]
    fn a_watcher_stops_when_it_is_dropped() {
        let calls = Arc::new(AtomicU16::new(0));
        let counted = Arc::clone(&calls);
        let watcher = Watcher::start(
            0u16,
            Duration::from_millis(5),
            move || counted.fetch_add(1, Ordering::Relaxed) + 1,
            |_| {},
        );
        thread::sleep(Duration::from_millis(40));

        drop(watcher);
        let after_drop = calls.load(Ordering::Relaxed);
        thread::sleep(Duration::from_millis(60));

        assert_eq!(calls.load(Ordering::Relaxed), after_drop);
    }
}
