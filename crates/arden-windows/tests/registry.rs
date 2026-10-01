//! Watching registry keys: a watcher sleeps until Windows says that a key changed, with no timer.
#![cfg(windows)]
// The tests make and delete a registry key of their own, and every call into Windows is unsafe.
#![allow(unsafe_code)]

use std::sync::mpsc;
use std::time::{Duration, Instant};

use arden_windows::registry::KeyWatcher;
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_DWORD, REG_OPTION_VOLATILE, RegCloseKey,
    RegCreateKeyExW, RegDeleteTreeW, RegSetKeyValueW,
};
use windows::core::HSTRING;

/// A key of its own under `HKEY_CURRENT_USER\Software`, gone when the test ends. It is volatile, so
/// even a test that is killed leaves nothing behind after the next sign-in.
struct TemporaryKey(String);

impl TemporaryKey {
    fn new(name: &str) -> Self {
        let path = format!(r"Software\ArdenCodeTests\{name}-{}", std::process::id());
        let mut key = HKEY::default();
        // SAFETY: the path is a valid string and `key` a place for the answer, closed right away.
        unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                &HSTRING::from(path.as_str()),
                None,
                None,
                REG_OPTION_VOLATILE,
                KEY_WRITE,
                None,
                &raw mut key,
                None,
            )
            .ok()
            .expect("a temporary key");
            let _ = RegCloseKey(key);
        }
        Self(path)
    }

    fn path(&self) -> &str {
        &self.0
    }

    /// Writes a number, as Windows writes the text size.
    fn set(&self, name: &str, value: u32) {
        let bytes = value.to_le_bytes();
        // SAFETY: the key exists and the data is four bytes, as REG_DWORD needs.
        unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(self.0.as_str()),
                &HSTRING::from(name),
                REG_DWORD.0,
                Some(bytes.as_ptr().cast()),
                4,
            )
            .ok()
            .expect("the value is written");
        }
    }
}

impl Drop for TemporaryKey {
    fn drop(&mut self) {
        // SAFETY: the path is the key this test made.
        let _ = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(self.0.as_str())) };
    }
}

/// A watcher on `key`, and what it reports.
fn watch(key: &TemporaryKey) -> (KeyWatcher, mpsc::Receiver<()>) {
    let (sender, changes) = mpsc::channel();
    let watcher = KeyWatcher::start(&[key.path()], move || {
        let _ = sender.send(());
    })
    .expect("a watcher");
    (watcher, changes)
}

#[test]
fn a_change_made_right_after_starting_is_reported_within_a_second() {
    let key = TemporaryKey::new("change");
    let (_watcher, changes) = watch(&key);

    key.set("TextScaleFactor", 150);

    assert!(changes.recv_timeout(Duration::from_secs(1)).is_ok());
}

#[test]
fn every_change_is_reported_not_only_the_first() {
    let key = TemporaryKey::new("again");
    let (_watcher, changes) = watch(&key);

    key.set("TextScaleFactor", 150);
    changes
        .recv_timeout(Duration::from_secs(1))
        .expect("the first change");
    key.set("TextScaleFactor", 175);

    assert!(changes.recv_timeout(Duration::from_secs(1)).is_ok());
}

#[test]
fn nothing_is_reported_while_nothing_changes() {
    let key = TemporaryKey::new("quiet");
    let (_watcher, changes) = watch(&key);

    assert!(changes.recv_timeout(Duration::from_millis(500)).is_err());
}

#[test]
fn the_watcher_stops_at_once_when_it_is_dropped() {
    let key = TemporaryKey::new("stop");
    let (watcher, _changes) = watch(&key);

    let started = Instant::now();
    drop(watcher);

    assert!(started.elapsed() < Duration::from_millis(500));
}
