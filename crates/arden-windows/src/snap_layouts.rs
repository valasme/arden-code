//! Windows 11's Snap Layouts on the app's own Maximize button (ADR 0009).
//!
//! Windows offers its layouts when the pointer rests on a window's Maximize button, and it finds the
//! button by asking the window under the pointer what is there (`WM_NCHITTEST`). The app draws its
//! title bar in the page, so that window is the web engine's, and it answers "the client area". An
//! overlay is a small window of the app's own, placed over the page's Maximize button, that answers
//! "a Maximize button" (`HTMAXBUTTON`).

// This module is a Win32 window: every call into Windows is unsafe. Each block says why it is sound.
#![allow(unsafe_code)]

use std::cell::Cell;
use std::ffi::c_void;
use std::sync::OnceLock;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, NULL_BRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    ReleaseCapture, SetCapture, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT, TrackMouseEvent,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GWLP_USERDATA, GetClientRect, GetWindowLongPtrW, HTMAXBUTTON,
    HWND_TOP, IDC_ARROW, LoadCursorW, MA_NOACTIVATE, RegisterClassExW, SW_HIDE, SWP_NOACTIVATE,
    SWP_SHOWWINDOW, SetWindowLongPtrW, SetWindowPos, ShowWindow, WINDOW_EX_STYLE,
    WM_CAPTURECHANGED, WM_LBUTTONUP, WM_MOUSEACTIVATE, WM_NCDESTROY, WM_NCHITTEST,
    WM_NCLBUTTONDBLCLK, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE,
    WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS,
};
use windows::core::{PCWSTR, w};

const CLASS_NAME: PCWSTR = w!("ArdenCodeMaximizeOverlay");

/// Where the page's Maximize button is: physical pixels from the top left of the window's client
/// area, which is where the page starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// How the page's Maximize button should look. The overlay takes the button's pointer input, so the
/// page cannot see the pointer on it; the overlay says instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Look {
    Normal,
    Hover,
    Pressed,
}

/// What the overlay tells the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    /// The button should now look like this.
    Look(Look),
    /// The button was clicked: pressed, and released on it.
    Click,
}

/// What the overlay keeps between the messages Windows sends it.
struct State {
    on_event: Box<dyn Fn(Event)>,
    look: Cell<Look>,
    /// Whether Windows will say when the pointer leaves. Asked once per visit, not on every move.
    tracking: Cell<bool>,
    /// Whether the button went down on the overlay and has not been released yet.
    pressed: Cell<bool>,
}

impl State {
    /// Tells the app how the button should look, when that changed.
    fn show(&self, look: Look) {
        if self.look.replace(look) != look {
            (self.on_event)(Event::Look(look));
        }
    }
}

/// The state of an overlay window, while it exists.
fn state<'a>(window: HWND) -> Option<&'a State> {
    // SAFETY: the value is either 0 or the pointer `MaximizeOverlay::new` stored, which stays valid
    // until `WM_NCDESTROY` clears it. Only the window's own thread calls this.
    unsafe { (GetWindowLongPtrW(window, GWLP_USERDATA) as *const State).as_ref() }
}

/// Asks Windows to say when the pointer leaves the overlay (`WM_NCMOUSELEAVE`).
fn track_leaving(window: HWND) {
    let mut request = TRACKMOUSEEVENT {
        cbSize: u32::try_from(size_of::<TRACKMOUSEEVENT>()).unwrap_or(u32::MAX),
        dwFlags: TME_LEAVE | TME_NONCLIENT,
        hwndTrack: window,
        dwHoverTime: 0,
    };
    // SAFETY: the structure is fully initialized and names a live window. If Windows refuses, the
    // button only keeps its hovered look until the pointer comes back.
    let _ = unsafe { TrackMouseEvent(&raw mut request) };
}

/// The overlay over the page's Maximize button. It belongs to its parent window and goes away with it.
pub struct MaximizeOverlay {
    window: isize,
}

impl MaximizeOverlay {
    /// Makes the overlay inside `parent`, hidden until it is placed. `on_event` is called on the
    /// window's thread, from inside its message handling, so it must not destroy the parent window
    /// there and then.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows cannot make the window, for example because `parent` is not one.
    pub fn new(parent: isize, on_event: impl Fn(Event) + 'static) -> windows::core::Result<Self> {
        register_class()?;
        // SAFETY: the class is registered above, the parent handle is checked by Windows (an invalid
        // one makes the call fail), and no creation parameter is passed.
        let window = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                CLASS_NAME,
                PCWSTR::null(),
                WS_CHILD | WS_CLIPSIBLINGS,
                0,
                0,
                0,
                0,
                Some(HWND(parent as *mut c_void)),
                None,
                Some(GetModuleHandleW(None)?.into()),
                None,
            )?
        };
        let state = Box::new(State {
            on_event: Box::new(on_event),
            look: Cell::new(Look::Normal),
            tracking: Cell::new(false),
            pressed: Cell::new(false),
        });
        // SAFETY: the window was just made on this thread. The state is freed when it is destroyed
        // (`WM_NCDESTROY`), and until then only its window procedure reads it.
        unsafe { SetWindowLongPtrW(window, GWLP_USERDATA, Box::into_raw(state) as isize) };
        Ok(Self {
            window: window.0 as isize,
        })
    }

    /// The overlay's window handle.
    #[must_use]
    pub const fn handle(&self) -> isize {
        self.window
    }

    /// Puts the overlay over `area`, above the page, or hides it when there is no button to cover.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows cannot move the window.
    pub fn place(&self, area: Option<Area>) -> windows::core::Result<()> {
        let Some(area) = area else {
            // SAFETY: the overlay is a live window. The result only says whether it was visible.
            let _ = unsafe { ShowWindow(self.hwnd(), SW_HIDE) };
            return Ok(());
        };
        // SAFETY: the overlay is a live window; the web engine's window is made before it, so it is
        // raised above that one on every move.
        unsafe {
            SetWindowPos(
                self.hwnd(),
                Some(HWND_TOP),
                area.x,
                area.y,
                area.width,
                area.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
        }
    }

    fn hwnd(&self) -> HWND {
        HWND(self.window as *mut c_void)
    }
}

/// Registers the overlay's window class, once for the whole process.
fn register_class() -> windows::core::Result<()> {
    static REGISTERED: OnceLock<windows::core::Result<()>> = OnceLock::new();
    REGISTERED
        .get_or_init(|| {
            // SAFETY: the structure is fully initialized, the procedure has the signature Windows
            // calls, and the stock hollow brush and arrow cursor are never freed.
            unsafe {
                let class = WNDCLASSEXW {
                    cbSize: u32::try_from(size_of::<WNDCLASSEXW>()).unwrap_or(u32::MAX),
                    lpfnWndProc: Some(window_procedure),
                    hInstance: GetModuleHandleW(None)?.into(),
                    hCursor: LoadCursorW(None, IDC_ARROW)?,
                    // The overlay never paints, so the page's button shows through it.
                    hbrBackground: HBRUSH(GetStockObject(NULL_BRUSH).0),
                    lpszClassName: CLASS_NAME,
                    ..Default::default()
                };
                if RegisterClassExW(&raw const class) == 0 {
                    return Err(windows::core::Error::from_thread());
                }
            }
            Ok(())
        })
        .clone()
}

extern "system" fn window_procedure(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        // Wherever the pointer is on the overlay, it is on a Maximize button.
        WM_NCHITTEST => return answer(HTMAXBUTTON),
        // A press does not make the overlay active, so the page keeps the keyboard focus. Maximizing
        // or restoring the window activates it anyway.
        WM_MOUSEACTIVATE => return answer(MA_NOACTIVATE),
        // Both go on to Windows as well, which shows its layouts from them.
        WM_NCMOUSEMOVE => {
            if let Some(state) = state(window) {
                if !state.tracking.replace(true) {
                    track_leaving(window);
                }
                state.show(Look::Hover);
            }
        }
        WM_NCMOUSELEAVE => {
            if let Some(state) = state(window) {
                state.tracking.set(false);
                if !state.pressed.get() {
                    state.show(Look::Normal);
                }
            }
        }
        // Never passed on: for a press on a Maximize button, Windows would wait in a loop of its own
        // for the release and then maximize the overlay itself.
        WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK => {
            if let Some(state) = state(window) {
                state.pressed.set(true);
                // Holding the pointer sends the release here wherever it happens.
                // SAFETY: the overlay is a live window of this thread.
                unsafe { SetCapture(window) };
                state.show(Look::Pressed);
            }
            return LRESULT(0);
        }
        WM_LBUTTONUP | WM_NCLBUTTONUP => {
            if let Some(state) = state(window) {
                release(
                    window,
                    state,
                    message == WM_NCLBUTTONUP || contains(window, lparam),
                );
            }
            return LRESULT(0);
        }
        // Something else took the pointer, such as Alt+Tab: the press is over, without a click.
        WM_CAPTURECHANGED => {
            if let Some(state) = state(window)
                && state.pressed.replace(false)
            {
                state.show(Look::Normal);
            }
        }
        WM_NCDESTROY => free_state(window),
        _ => {}
    }
    // SAFETY: Windows calls this with a valid window and message, which are passed on unchanged.
    unsafe { DefWindowProcW(window, message, wparam, lparam) }
}

/// Ends a press: a click when the pointer was released on the overlay.
fn release(window: HWND, state: &State, on_it: bool) {
    // Cleared first: letting go of the pointer sends `WM_CAPTURECHANGED`, which must not see a press.
    if !state.pressed.replace(false) {
        return;
    }
    // SAFETY: only this thread's window holds the pointer, if any window does.
    let _ = unsafe { ReleaseCapture() };
    if on_it {
        state.show(Look::Hover);
        // Holding the pointer ended the watch for it leaving. Asked again, Windows says at once if it
        // has already gone, for example because the window was maximized under it.
        state.tracking.set(true);
        track_leaving(window);
        (state.on_event)(Event::Click);
    } else {
        state.tracking.set(false);
        state.show(Look::Normal);
    }
}

/// Whether the point of a client-area message, such as a release, is on the overlay.
fn contains(window: HWND, lparam: LPARAM) -> bool {
    let (x, y) = point(lparam);
    let mut area = RECT::default();
    // SAFETY: the overlay is a live window and `area` is a place for the answer.
    if unsafe { GetClientRect(window, &raw mut area) }.is_err() {
        return false;
    }
    (area.left..area.right).contains(&x) && (area.top..area.bottom).contains(&y)
}

/// A number Windows expects as the answer to a message. The ones used here are small.
fn answer(value: u32) -> LRESULT {
    LRESULT(isize::try_from(value).unwrap_or_default())
}

/// The point of a message: its low and high words, taken bit for bit as the signed numbers they are.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]
fn point(lparam: LPARAM) -> (i32, i32) {
    let x = lparam.0 as u16 as i16;
    let y = (lparam.0 >> 16) as u16 as i16;
    (i32::from(x), i32::from(y))
}

/// Frees the overlay's state as its window goes away.
fn free_state(window: HWND) {
    // SAFETY: the value is either 0 or the pointer `MaximizeOverlay::new` stored, and it is cleared
    // before the state is freed, so nothing can read it afterwards.
    unsafe {
        let pointer = SetWindowLongPtrW(window, GWLP_USERDATA, 0) as *mut State;
        if !pointer.is_null() {
            drop(Box::from_raw(pointer));
        }
    }
}
