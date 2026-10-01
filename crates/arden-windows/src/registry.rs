//! Watching registry keys for changes without a timer: the watching thread sleeps until Windows
//! signals that a key changed, or until it is told to stop.

// Registry notifications and events are Win32 calls, and every one is unsafe. Each block says why it
// is sound.
#![allow(unsafe_code)]

use std::ffi::c_void;
use std::sync::mpsc;
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{CloseHandle, E_FAIL, HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, REG_NOTIFY_CHANGE_NAME,
    RegCloseKey, RegNotifyChangeKeyValue, RegOpenKeyExW,
};
use windows::Win32::System::Threading::{CreateEventW, INFINITE, SetEvent, WaitForMultipleObjects};
use windows::core::{HSTRING, PCWSTR};

/// Calls a function whenever one of the watched keys, or one of their values, changes. The thread
/// ends when this is dropped.
pub struct KeyWatcher {
    /// The event that tells the thread to stop, as a number so the watcher can move between threads.
    stop: isize,
    thread: Option<JoinHandle<()>>,
}

impl KeyWatcher {
    /// Starts watching `keys`, paths under `HKEY_CURRENT_USER`. A key that does not exist is skipped.
    /// It returns once Windows is watching, so a change made right after is not missed.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows cannot make the stop event or the thread.
    pub fn start(
        keys: &[&str],
        on_change: impl Fn() + Send + 'static,
    ) -> windows::core::Result<Self> {
        // SAFETY: an unnamed manual-reset event that starts unsignaled; `Drop` closes it.
        let stop = unsafe { CreateEventW(None, true, false, PCWSTR::null())? }.0 as isize;
        let paths: Vec<String> = keys.iter().map(|&key| key.to_owned()).collect();
        let (ready, started) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("registry watcher".to_owned())
            .spawn(move || watch(&paths, handle(stop), &ready, &on_change))
            .map_err(|error| windows::core::Error::new(E_FAIL, error.to_string()))?;
        let _ = started.recv();
        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }
}

impl Drop for KeyWatcher {
    fn drop(&mut self) {
        // SAFETY: the stop event stays open until it is closed below, after the thread has ended.
        let _ = unsafe { SetEvent(handle(self.stop)) };
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // SAFETY: as above; nothing uses the event any more.
        let _ = unsafe { CloseHandle(handle(self.stop)) };
    }
}

fn handle(value: isize) -> HANDLE {
    HANDLE(value as *mut c_void)
}

/// A key being watched, and the event Windows signals when it changes.
struct Watched {
    key: HKEY,
    event: HANDLE,
}

impl Watched {
    /// Opens `path` and asks Windows to signal a change. Notifications come once, so this is asked
    /// again after each one.
    fn open(path: &str) -> Option<Self> {
        let mut key = HKEY::default();
        // SAFETY: the path is a valid string and `key` is a place for the answer.
        let opened = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                &HSTRING::from(path),
                None,
                KEY_NOTIFY,
                &raw mut key,
            )
        };
        if opened.is_err() {
            return None;
        }
        // SAFETY: an unnamed auto-reset event that starts unsignaled; `close` closes it.
        let Ok(event) = (unsafe { CreateEventW(None, false, false, PCWSTR::null()) }) else {
            // SAFETY: the key was opened above and nothing else has it.
            let _ = unsafe { RegCloseKey(key) };
            return None;
        };
        let watched = Self { key, event };
        if watched.arm() {
            Some(watched)
        } else {
            watched.close();
            None
        }
    }

    /// Asks Windows to signal the event at the next change to the key's values or subkeys.
    fn arm(&self) -> bool {
        // SAFETY: the key and the event are open, and this thread stays alive while it waits, as an
        // asynchronous notification needs.
        unsafe {
            RegNotifyChangeKeyValue(
                self.key,
                false,
                REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET,
                Some(self.event),
                true,
            )
        }
        .is_ok()
    }

    fn close(self) {
        // SAFETY: both were opened by `open` and are closed once, here.
        unsafe {
            let _ = RegCloseKey(self.key);
            let _ = CloseHandle(self.event);
        }
    }
}

/// The watching thread: it sleeps until a key changes or `stop` is signaled.
fn watch(paths: &[String], stop: HANDLE, ready: &mpsc::Sender<()>, on_change: &dyn Fn()) {
    let watched: Vec<Watched> = paths
        .iter()
        .filter_map(|path| Watched::open(path))
        .collect();
    let _ = ready.send(());

    let events: Vec<HANDLE> = std::iter::once(stop)
        .chain(watched.iter().map(|watched| watched.event))
        .collect();
    loop {
        // SAFETY: every handle is an open event, and none is closed while this waits.
        let signaled = unsafe { WaitForMultipleObjects(&events, false, INFINITE) };
        let index = signaled.0.wrapping_sub(WAIT_OBJECT_0.0) as usize;
        // The stop event, or a failure to wait: either way the watching is over.
        let Some(changed) = index.checked_sub(1).and_then(|index| watched.get(index)) else {
            break;
        };
        // Asked again before reading, so a change made while the value is read is not missed.
        changed.arm();
        on_change();
    }
    for watched in watched {
        watched.close();
    }
}
