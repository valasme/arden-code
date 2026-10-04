//! The window's system menu (Restore, Move, Size, Minimize, Maximize, Close), which Windows shows
//! for Alt+Space and for a click on the icon at the left of a title bar.

use std::ffi::c_void;

use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::WindowsAndMessaging::{
    EnableMenuItem, GetSystemMenu, IsZoomed, MF_BYCOMMAND, MF_ENABLED, MF_GRAYED, PostMessageW,
    SC_CLOSE, SC_KEYMENU, SC_MAXIMIZE, SC_MINIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE,
    SetMenuDefaultItem, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON, TPM_TOPALIGN,
    TrackPopupMenu, WM_SYSCOMMAND,
};

/// Opens the system menu of the window with the given handle, as if the user pressed Alt+Space:
/// Windows puts it at the window's top left corner.
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

/// Where a point of the page lands in the window's client area, in physical pixels: the page
/// measures in logical pixels, which the display's scale turns into physical ones.
#[must_use]
pub fn client_point(x: f64, y: f64, scale: f64) -> (i32, i32) {
    // The page's coordinates are small and positive; rounding to a pixel is all that is lost.
    #[allow(clippy::cast_possible_truncation)]
    let round = |value: f64| (value * scale).round() as i32;
    (round(x), round(y))
}

/// Opens the system menu of the window with the given handle with its top left corner at a point of
/// the window's client area (physical pixels), as Windows does for a right click on a title bar it
/// draws itself, and carries out the command chosen from it.
///
/// It must run on the thread that owns the window, and returns once the menu has closed.
///
/// # Errors
///
/// Returns an error when `window` is not a valid window handle.
pub fn show_at(window: isize, (x, y): (i32, i32)) -> windows::core::Result<()> {
    let handle = HWND(window as *mut c_void);
    // SAFETY: every call below only reads its arguments or writes to `point`, which lives on this
    // stack frame. An invalid handle makes them fail with an error instead of touching memory. The
    // menu returned by GetSystemMenu belongs to the window and is not destroyed here.
    #[allow(unsafe_code)]
    unsafe {
        let mut point = POINT { x, y };
        ClientToScreen(handle, &raw mut point).ok()?;
        let menu = GetSystemMenu(handle, false);
        if menu.is_invalid() {
            return Err(windows::core::Error::from_thread());
        }
        // Windows only updates the items itself for the menu it opens; this one says what can be
        // done to the window as it is now, as Windows' own does.
        let maximized = IsZoomed(handle).as_bool();
        for (command, enabled) in [
            (SC_RESTORE, maximized),
            (SC_MOVE, !maximized),
            (SC_SIZE, !maximized),
            (SC_MINIMIZE, true),
            (SC_MAXIMIZE, !maximized),
            (SC_CLOSE, true),
        ] {
            let state = if enabled { MF_ENABLED } else { MF_GRAYED };
            let _ = EnableMenuItem(menu, command, MF_BYCOMMAND | state);
        }
        SetMenuDefaultItem(menu, SC_CLOSE, 0)?;
        let chosen = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_LEFTALIGN | TPM_TOPALIGN,
            point.x,
            point.y,
            None,
            handle,
            None,
        );
        // With TPM_RETURNCMD the answer is the chosen command, or 0 when the menu was dismissed.
        let command = chosen.0;
        if command != 0 {
            PostMessageW(
                Some(handle),
                WM_SYSCOMMAND,
                WPARAM(usize::try_from(command).unwrap_or_default()),
                LPARAM(0),
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_an_error_for_a_window_that_does_not_exist() {
        // 1 is not a valid window handle.
        assert!(show(1).is_err());
        assert!(show_at(1, (0, 0)).is_err());
    }

    #[test]
    fn turns_the_page_s_pixels_into_the_window_s() {
        assert_eq!(client_point(40.0, 32.0, 1.0), (40, 32));
        assert_eq!(client_point(40.0, 32.0, 1.5), (60, 48));
        assert_eq!(client_point(10.4, 10.6, 1.25), (13, 13));
    }
}
