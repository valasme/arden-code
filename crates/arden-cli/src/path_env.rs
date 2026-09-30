//! Putting the command's folder on the user's `PATH`, and taking it off again.
//!
//! The user's `PATH` is the value `Path` under `HKEY_CURRENT_USER\Environment`. It is usually of
//! the kind `REG_EXPAND_SZ`, which may hold variables such as `%USERPROFILE%`; those must stay as
//! they are written, so the value is read and written without expanding it, and keeps its kind.
//! Changing it needs no administrator.

use std::io;
use std::path::Path;

/// The key under `HKEY_CURRENT_USER` that holds the user's environment variables.
pub const ENVIRONMENT_KEY: &str = "Environment";
/// The variable.
pub const PATH_VALUE: &str = "Path";

/// Puts a folder on the user's `PATH`, when it is not there already.
///
/// # Errors
///
/// Returns an error when the registry cannot be read or written.
pub fn add_to_user_path(folder: &Path) -> io::Result<()> {
    if change(ENVIRONMENT_KEY, PATH_VALUE, &folder.to_string_lossy(), true)? {
        broadcast_environment_change();
    }
    Ok(())
}

/// Takes a folder off the user's `PATH`, when it is there.
///
/// # Errors
///
/// Returns an error when the registry cannot be read or written.
pub fn remove_from_user_path(folder: &Path) -> io::Result<()> {
    if change(
        ENVIRONMENT_KEY,
        PATH_VALUE,
        &folder.to_string_lossy(),
        false,
    )? {
        broadcast_environment_change();
    }
    Ok(())
}

/// Adds a folder to (or removes it from) a list in a value under `HKEY_CURRENT_USER`. Says whether
/// the value was changed. Separate from the two functions above so a test can use a key of its own
/// instead of the real `PATH`.
///
/// # Errors
///
/// Returns an error when the registry cannot be read or written.
#[cfg(windows)]
pub fn change(key: &str, value: &str, folder: &str, add: bool) -> io::Result<bool> {
    windows_registry::change(key, value, folder, add)
}

/// Without Windows there is no registry, and nothing to change.
///
/// # Errors
///
/// Never.
#[cfg(not(windows))]
#[allow(clippy::unnecessary_wraps)]
pub fn change(_key: &str, _value: &str, _folder: &str, _add: bool) -> io::Result<bool> {
    let _ = crate::path_list::with_entry;
    Ok(false)
}

/// Tells programs that are running that the environment changed, so a terminal opened from now on
/// sees the new `PATH` without signing out.
fn broadcast_environment_change() {
    #[cfg(windows)]
    windows_registry::broadcast();
}

#[cfg(windows)]
mod windows_registry {
    use std::io;

    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, LPARAM, WPARAM};
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ, REG_OPTION_NON_VOLATILE,
        REG_SZ, REG_VALUE_TYPE, RegCloseKey, RegCreateKeyExW, RegQueryValueExW, RegSetValueExW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        HWND_BROADCAST, SMTO_ABORTIFHUNG, SendMessageTimeoutW, WM_SETTINGCHANGE,
    };
    use windows::core::PCWSTR;

    use crate::path_list;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn os_error(code: windows::Win32::Foundation::WIN32_ERROR) -> io::Error {
        io::Error::from_raw_os_error(i32::try_from(code.0).unwrap_or(i32::MAX))
    }

    /// Closes a registry key when it goes out of scope.
    struct Key(HKEY);

    impl Drop for Key {
        #[allow(unsafe_code)]
        fn drop(&mut self) {
            // SAFETY: the key was opened by `open` and is closed only here.
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    /// Opens (or makes) a key under `HKEY_CURRENT_USER` for reading and writing.
    #[allow(unsafe_code)]
    fn open(path: &str) -> io::Result<Key> {
        let path = wide(path);
        let mut key = HKEY::default();
        // SAFETY: \`path\` is a null-terminated string that lives for the call, and \`key\` is a
        // valid place for the answer.
        let status = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(path.as_ptr()),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_READ | KEY_WRITE,
                None,
                &raw mut key,
                None,
            )
        };
        if status == ERROR_SUCCESS {
            Ok(Key(key))
        } else {
            Err(os_error(status))
        }
    }

    /// A value as text, with its kind; nothing when it does not exist. Variables are not expanded.
    #[allow(unsafe_code)]
    fn read(key: &Key, name: &str) -> io::Result<Option<(String, REG_VALUE_TYPE)>> {
        let name = wide(name);
        let mut kind = REG_VALUE_TYPE::default();
        let mut size = 0_u32;
        // SAFETY: the first call only asks how large the value is; \`name\` lives for the call.
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                Some(&raw mut kind),
                None,
                Some(&raw mut size),
            )
        };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            return Err(os_error(status));
        }
        if kind != REG_SZ && kind != REG_EXPAND_SZ {
            return Err(io::Error::other("the value is not text"));
        }
        let mut buffer = vec![0_u8; size as usize];
        // SAFETY: \`buffer\` is \`size\` bytes long, as the first call said the value needs.
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                Some(&raw mut kind),
                Some(buffer.as_mut_ptr()),
                Some(&raw mut size),
            )
        };
        if status != ERROR_SUCCESS {
            return Err(os_error(status));
        }
        let units: Vec<u16> = buffer[..size as usize]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes(*pair))
            .take_while(|unit| *unit != 0)
            .collect();
        Ok(Some((String::from_utf16_lossy(&units), kind)))
    }

    #[allow(unsafe_code)]
    fn write(key: &Key, name: &str, text: &str, kind: REG_VALUE_TYPE) -> io::Result<()> {
        let name = wide(name);
        let bytes: Vec<u8> = wide(text).into_iter().flat_map(u16::to_le_bytes).collect();
        // SAFETY: \`name\` and \`bytes\` live for the call, and \`bytes\` holds the null-terminated
        // text the value's kind promises.
        let status =
            unsafe { RegSetValueExW(key.0, PCWSTR(name.as_ptr()), None, kind, Some(&bytes)) };
        if status == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(os_error(status))
        }
    }

    pub fn change(key_path: &str, value: &str, folder: &str, add: bool) -> io::Result<bool> {
        let key = open(key_path)?;
        let existing = read(&key, value)?;
        let (list, kind) = existing.unwrap_or_else(|| (String::new(), REG_EXPAND_SZ));
        let changed = if add {
            path_list::with_entry(&list, folder)
        } else {
            path_list::without_entry(&list, folder)
        };
        let Some(changed) = changed else {
            return Ok(false);
        };
        write(&key, value, &changed, kind)?;
        Ok(true)
    }

    /// Puts text in a value that expands variables, for a test.
    #[cfg(test)]
    pub fn seed(key_path: &str, value: &str, text: &str) -> io::Result<()> {
        let key = open(key_path)?;
        write(&key, value, text, REG_EXPAND_SZ)
    }

    /// The text of a value, for a test.
    #[cfg(test)]
    pub fn read_text(key_path: &str, value: &str) -> io::Result<String> {
        let key = open(key_path)?;
        Ok(read(&key, value)?.map(|(text, _)| text).unwrap_or_default())
    }

    /// The kind of a value, for a test.
    #[cfg(test)]
    pub fn read_kind(key_path: &str, value: &str) -> io::Result<REG_VALUE_TYPE> {
        let key = open(key_path)?;
        Ok(read(&key, value)?.map(|(_, kind)| kind).unwrap_or_default())
    }

    #[allow(unsafe_code)]
    pub fn broadcast() {
        let setting = wide("Environment");
        // SAFETY: \`setting\` is a null-terminated string that lives for the call. A program that
        // does not answer within five seconds is skipped.
        unsafe {
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(setting.as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                5000,
                None,
            );
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::io;

    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RegDeleteTreeW};
    use windows::core::PCWSTR;

    use super::*;

    /// A key of a test's own, removed at the end, so the real `PATH` is never touched.
    struct TestKey(String);

    impl TestKey {
        fn new(name: &str) -> Self {
            Self(format!(
                r"Software\ArdenCodeTests\{name}-{}",
                std::process::id()
            ))
        }
    }

    impl Drop for TestKey {
        #[allow(unsafe_code)]
        fn drop(&mut self) {
            let path: Vec<u16> = self.0.encode_utf16().chain(std::iter::once(0)).collect();
            // SAFETY: the string is null-terminated and lives for the call.
            unsafe {
                let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()));
            }
        }
    }

    const BIN: &str = r"C:\Program Files\Arden Code\bin";

    #[test]
    fn adds_the_folder_to_a_list_that_is_not_there_yet() -> io::Result<()> {
        let key = TestKey::new("new");

        assert!(change(&key.0, "Path", BIN, true)?);
        assert!(
            !change(&key.0, "Path", BIN, true)?,
            "the second time there is nothing to do"
        );
        assert!(change(&key.0, "Path", BIN, false)?);
        assert!(!change(&key.0, "Path", BIN, false)?);
        Ok(())
    }

    #[test]
    fn keeps_the_other_entries_and_their_variables_exactly_as_they_were() -> io::Result<()> {
        use windows::Win32::System::Registry::REG_EXPAND_SZ;

        let key = TestKey::new("variables");
        // A value that holds a variable, of the kind that expands.
        windows_registry::seed(&key.0, "Path", r"%USERPROFILE%in;C:Tools")?;

        change(&key.0, "Path", BIN, true)?;

        assert_eq!(
            windows_registry::read_text(&key.0, "Path")?,
            format!(r"%USERPROFILE%in;C:Tools;{BIN}")
        );
        assert_eq!(windows_registry::read_kind(&key.0, "Path")?, REG_EXPAND_SZ);
        change(&key.0, "Path", BIN, false)?;
        assert_eq!(
            windows_registry::read_text(&key.0, "Path")?,
            r"%USERPROFILE%in;C:Tools"
        );
        Ok(())
    }

    #[test]
    fn a_very_long_list_is_not_cut_short() -> io::Result<()> {
        let key = TestKey::new("long");
        let long: Vec<String> = (0..200)
            .map(|number| format!(r"C:SomeLongFolderName{number}"))
            .collect();
        let list = long.join(";");
        assert!(list.len() > 4000);
        windows_registry::seed(&key.0, "Path", &list)?;

        change(&key.0, "Path", BIN, true)?;

        assert_eq!(
            windows_registry::read_text(&key.0, "Path")?,
            format!("{list};{BIN}")
        );
        Ok(())
    }
}
