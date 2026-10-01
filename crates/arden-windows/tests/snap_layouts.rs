//! The overlay that brings Snap Layouts to the app's Maximize button, seen the way Windows sees it:
//! through the messages Windows sends it.
#![cfg(windows)]
// The tests talk to real windows, and every call into Windows is unsafe.
#![allow(unsafe_code)]
// They build Windows' messages by hand from small numbers and handles, as Windows packs them.
#![allow(clippy::cast_possible_wrap, clippy::cast_sign_loss)]

use std::cell::RefCell;
use std::ffi::c_void;
use std::rc::Rc;

use arden_windows::snap_layouts::{Area, Event, Look, MaximizeOverlay};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CWP_SKIPINVISIBLE, ChildWindowFromPointEx, CreateWindowExW, DestroyWindow, HTMAXBUTTON,
    MA_NOACTIVATE, SendMessageW, WINDOW_EX_STYLE, WM_LBUTTONUP, WM_MOUSEACTIVATE, WM_NCHITTEST,
    WM_NCLBUTTONDOWN, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE, WS_CHILD, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_POPUP, WS_VISIBLE,
};
use windows::core::{PCWSTR, w};

/// A window for the overlay to sit in, as the app's window does. It is far off every screen, so a
/// test never flashes one.
struct Parent(HWND);

impl Parent {
    fn new() -> Self {
        // SAFETY: STATIC is a window class every process has, and the rest are plain values.
        let window = unsafe {
            CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                w!("STATIC"),
                PCWSTR::null(),
                WS_POPUP | WS_VISIBLE,
                -32_000,
                -32_000,
                800,
                600,
                None,
                None,
                None,
                None,
            )
        }
        .expect("a window for the overlay");
        Self(window)
    }

    fn handle(&self) -> isize {
        self.0.0 as isize
    }

    /// A child window over the whole client area, as the web engine's window is. It is made before
    /// the overlay, as in the app.
    fn page(&self) -> isize {
        // SAFETY: as in `new`; the parent is a live window of this thread.
        let window = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                PCWSTR::null(),
                WS_CHILD | WS_VISIBLE,
                0,
                0,
                800,
                600,
                Some(self.0),
                None,
                None,
                None,
            )
        }
        .expect("a page");
        window.0 as isize
    }

    /// The child window Windows finds at a point of the client area, as it does for the pointer.
    fn window_at(&self, x: i32, y: i32) -> isize {
        // SAFETY: the parent is a live window of this thread; the call only reads.
        unsafe { ChildWindowFromPointEx(self.0, POINT { x, y }, CWP_SKIPINVISIBLE) }.0 as isize
    }
}

impl Drop for Parent {
    fn drop(&mut self) {
        // SAFETY: this thread made the window. Destroying it also destroys the overlay inside it.
        let _ = unsafe { DestroyWindow(self.0) };
    }
}

/// What the overlay has told the app so far, and the callback that collects it.
fn recorder() -> (Rc<RefCell<Vec<Event>>>, impl Fn(Event) + 'static) {
    let events = Rc::new(RefCell::new(Vec::new()));
    let sink = Rc::clone(&events);
    (events, move |event| sink.borrow_mut().push(event))
}

/// Sends a message the way Windows does, and returns the answer.
fn send(window: isize, message: u32, wparam: usize, lparam: isize) -> isize {
    // SAFETY: the window belongs to this thread, so the message is handled before this returns.
    unsafe {
        SendMessageW(
            HWND(window as *mut c_void),
            message,
            Some(WPARAM(wparam)),
            Some(LPARAM(lparam)),
        )
    }
    .0
}

#[test]
fn windows_is_told_the_overlay_is_a_maximize_button() {
    let parent = Parent::new();
    let overlay = MaximizeOverlay::new(parent.handle(), |_| {}).expect("an overlay");

    assert_eq!(
        send(overlay.handle(), WM_NCHITTEST, 0, 0),
        HTMAXBUTTON as isize
    );
}

#[test]
fn a_press_on_the_overlay_leaves_the_keyboard_focus_in_the_page() {
    let parent = Parent::new();
    let overlay = MaximizeOverlay::new(parent.handle(), |_| {}).expect("an overlay");

    let press = (WM_NCLBUTTONDOWN << 16) | HTMAXBUTTON;
    assert_eq!(
        send(
            overlay.handle(),
            WM_MOUSEACTIVATE,
            parent.handle() as usize,
            press as isize
        ),
        MA_NOACTIVATE as isize
    );
}

/// The Maximize button of an 800 px wide window: 46 by 32, with Close to its right.
const BUTTON: Area = Area {
    x: 708,
    y: 0,
    width: 46,
    height: 32,
};

#[test]
fn the_overlay_covers_exactly_the_area_it_is_placed_on_above_the_page() {
    let parent = Parent::new();
    let page = parent.page();
    let overlay = MaximizeOverlay::new(parent.handle(), |_| {}).expect("an overlay");

    overlay.place(Some(BUTTON)).expect("placed");

    assert_eq!(parent.window_at(708, 0), overlay.handle(), "top left");
    assert_eq!(parent.window_at(753, 31), overlay.handle(), "bottom right");
    assert_eq!(parent.window_at(707, 10), page, "left of it");
    assert_eq!(parent.window_at(754, 10), page, "right of it");
    assert_eq!(parent.window_at(730, 32), page, "below it");
}

#[test]
fn without_a_button_to_cover_the_overlay_leaves_the_spot_to_the_page() {
    let parent = Parent::new();
    let page = parent.page();
    let overlay = MaximizeOverlay::new(parent.handle(), |_| {}).expect("an overlay");

    overlay.place(Some(BUTTON)).expect("placed");
    overlay.place(None).expect("hidden");

    assert_eq!(parent.window_at(730, 10), page);
}

/// Windows' pointer messages over the overlay. The point does not matter: all of it is the button.
fn pointer_moves(overlay: &MaximizeOverlay) {
    send(overlay.handle(), WM_NCMOUSEMOVE, HTMAXBUTTON as usize, 0);
}

fn pointer_leaves(overlay: &MaximizeOverlay) {
    send(overlay.handle(), WM_NCMOUSELEAVE, 0, 0);
}

#[test]
fn the_button_looks_hovered_once_the_pointer_is_on_it() {
    let parent = Parent::new();
    let (events, record) = recorder();
    let overlay = MaximizeOverlay::new(parent.handle(), record).expect("an overlay");

    pointer_moves(&overlay);
    pointer_moves(&overlay);

    assert_eq!(*events.borrow(), [Event::Look(Look::Hover)]);
}

#[test]
fn the_button_looks_normal_again_when_the_pointer_leaves() {
    let parent = Parent::new();
    let (events, record) = recorder();
    let overlay = MaximizeOverlay::new(parent.handle(), record).expect("an overlay");

    pointer_moves(&overlay);
    pointer_leaves(&overlay);

    assert_eq!(events.borrow().last(), Some(&Event::Look(Look::Normal)));
}

fn button_goes_down(overlay: &MaximizeOverlay) {
    send(overlay.handle(), WM_NCLBUTTONDOWN, HTMAXBUTTON as usize, 0);
}

/// The button is released at a point of the overlay's client area. The overlay holds the pointer
/// from the moment the button went down, so Windows sends the release to it wherever it happens.
fn button_goes_up_at(overlay: &MaximizeOverlay, x: i16, y: i16) {
    let point = (i32::from(y) << 16) | (i32::from(x) & 0xFFFF);
    send(overlay.handle(), WM_LBUTTONUP, 0, point as isize);
}

/// An overlay over `BUTTON`, 46 by 32, with a recorder of what it says.
fn placed_overlay(parent: &Parent) -> (MaximizeOverlay, Rc<RefCell<Vec<Event>>>) {
    let (events, record) = recorder();
    let overlay = MaximizeOverlay::new(parent.handle(), record).expect("an overlay");
    overlay.place(Some(BUTTON)).expect("placed");
    (overlay, events)
}

#[test]
fn the_button_looks_pressed_while_it_is_held_down() {
    let parent = Parent::new();
    let (overlay, events) = placed_overlay(&parent);

    pointer_moves(&overlay);
    button_goes_down(&overlay);

    assert_eq!(events.borrow().last(), Some(&Event::Look(Look::Pressed)));
}

#[test]
fn releasing_the_button_on_it_clicks_it() {
    let parent = Parent::new();
    let (overlay, events) = placed_overlay(&parent);

    pointer_moves(&overlay);
    button_goes_down(&overlay);
    button_goes_up_at(&overlay, 20, 16);

    assert!(events.borrow().contains(&Event::Click));
}

#[test]
fn releasing_the_button_after_moving_off_it_does_not_click_it() {
    let parent = Parent::new();
    let (overlay, events) = placed_overlay(&parent);

    pointer_moves(&overlay);
    button_goes_down(&overlay);
    button_goes_up_at(&overlay, 80, 16);

    assert!(!events.borrow().contains(&Event::Click));
    assert_eq!(events.borrow().last(), Some(&Event::Look(Look::Normal)));
}
