//! The system settings the UI follows, whatever the platform: the regional format (which decides
//! how dates and numbers are written) and the text size.
//!
//! The web engine formats by its own UI language and knows nothing of the text size, so each
//! platform's crate reads both (`arden-windows`, `arden-linux`) and hands them to the UI in this
//! shape.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// The locale to use when the system gives none that can be used.
pub const FALLBACK_LOCALE: &str = "en-US";

/// The text sizes the interface is drawn at: Windows' text size runs from 100% to 225%, and a
/// larger text size of another platform is brought inside it.
const TEXT_SCALE_RANGE: (u16, u16) = (100, 225);

/// The variable that names a file standing in for the system's settings, in debug builds.
pub const STAND_IN_VARIABLE: &str = "ARDEN_CODE_SYSTEM_PREFERENCES_FILE";

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

/// The text size from what the system stored: a percentage, or nothing when the person never
/// changed it.
#[must_use]
pub fn text_scale_percent(stored: Option<u32>) -> u16 {
    let percent = stored.unwrap_or(u32::from(TEXT_SCALE_RANGE.0));
    u16::try_from(percent)
        .unwrap_or(TEXT_SCALE_RANGE.1)
        .clamp(TEXT_SCALE_RANGE.0, TEXT_SCALE_RANGE.1)
}

/// A language tag the UI can pass to `Intl`, from the name the system gave. Anything that is not a
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

/// The stand-in for the system's settings that a debug build reads when [`STAND_IN_VARIABLE`]
/// names a JSON file, so tests can change the text size and the regional format without touching
/// the real settings. Release builds never look at it.
#[cfg(debug_assertions)]
#[must_use]
pub fn read_stand_in() -> Option<SystemPreferences> {
    let path = std::env::var_os(STAND_IN_VARIABLE)?;
    let text = std::fs::read_to_string(path).ok()?;
    let mut preferences: SystemPreferences = serde_json::from_str(&text).ok()?;
    preferences.text_scale_percent =
        text_scale_percent(Some(u32::from(preferences.text_scale_percent)));
    preferences.locale = normalize_locale(&preferences.locale);
    Some(preferences)
}

/// Calls a function whenever a value that is read on a timer changes. The thread ends when this is
/// dropped. Only the stand-in file of debug builds is watched this way; each platform watches the
/// system in its own way, which needs no timer.
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
