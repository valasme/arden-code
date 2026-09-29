//! The window's system menu (Restore, Move, Size, Minimize, Maximize, Close), which Windows shows
//! for Alt+Space and for a click on the icon at the left of a title bar.

use std::ffi::c_void;

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, SC_KEYMENU, WM_SYSCOMMAND};

/// Opens the system menu of the window with the given handle, as if the user pressed Alt+Space.
///
/// The menu opens from the window's own message loop, so this returns right away instead of waiting
/// for the menu to close.
///
/// # Errors
///
/// Returns an error when `window` is not a valid window handle.
pub fn show(window: isize) -> windows::core::Result<()> {
    let handle = HWND(window as *mut c_void);
    // SAFETY: PostMessageW only reads its arguments. An invalid handle makes it fail with an error
    // instead of touching memory. SC_KEYMENU with a space is exactly what Alt+Space sends.
    #[allow(unsafe_code)]
    unsafe {
        PostMessageW(
            Some(handle),
            WM_SYSCOMMAND,
            WPARAM(SC_KEYMENU as usize),
            LPARAM(i32::from(b' ') as isize),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_an_error_for_a_window_that_does_not_exist() {
        // 1 is not a valid window handle.
        assert!(show(1).is_err());
    }
}
