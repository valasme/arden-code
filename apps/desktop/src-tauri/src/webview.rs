//! Settings of the web engine (`WebView2`) that make the window behave like an app and not like a
//! browser: no reload, print, find or zoom keys, no browser context menu, no autofill.
//!
//! Release builds only. A debug build keeps the browser's shortcuts and menu, which developers use.
//! The code is built in both, so that it is checked and linted every time.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Manager, WebviewWindow};

/// Whether developer mode is on. The key handler reads it on every key press.
static DEVELOPER_MODE: AtomicBool = AtomicBool::new(false);
/// Set when the web engine failed and the page was reloaded; the page asks for it once.
static FAILED: AtomicBool = AtomicBool::new(false);
/// Whether the key handler has been added to the web engine. It is added once.
static KEYS_CAUGHT: AtomicBool = AtomicBool::new(false);

/// Virtual key codes of the keys in [`is_browser_shortcut`].
mod key {
    pub const F3: u32 = 0x72;
    pub const F5: u32 = 0x74;
    pub const F7: u32 = 0x76;
    pub const F12: u32 = 0x7B;
    pub const C: u32 = 0x43;
    pub const F: u32 = 0x46;
    pub const G: u32 = 0x47;
    pub const H: u32 = 0x48;
    pub const I: u32 = 0x49;
    pub const J: u32 = 0x4A;
    pub const O: u32 = 0x4F;
    pub const P: u32 = 0x50;
    pub const R: u32 = 0x52;
    pub const S: u32 = 0x53;
    pub const U: u32 = 0x55;
}

/// Whether a key press is one of the shortcuts a browser has for its own features: reload, find,
/// print, save, view source, downloads, history and the developer tools.
///
/// Keys the app uses itself (Ctrl+K, Ctrl+B, Ctrl+J, Ctrl+L, zoom, F6, F11 ...) are not in this
/// list, and neither are the keys that edit text (Ctrl+A, C, V, X, Z, Y).
#[must_use]
pub fn is_browser_shortcut(key: u32, ctrl: bool, shift: bool, alt: bool) -> bool {
    match (ctrl, shift, alt) {
        // Reload, find next, caret browsing and the developer tools, alone.
        (false, false, false) => matches!(key, key::F3 | key::F5 | key::F7 | key::F12),
        // Hard reload, find, print, save, view source, open a file, history.
        (true, false, false) => matches!(
            key,
            key::F5
                | key::F3
                | key::R
                | key::F
                | key::G
                | key::P
                | key::S
                | key::U
                | key::O
                | key::H
        ),
        // Hard reload, the developer tools, find previous.
        (true, true, false) => matches!(
            key,
            key::R | key::G | key::I | key::J | key::C | key::F5 | key::F3 | key::P | key::S
        ),
        _ => false,
    }
}

/// Whether the web engine failed since the last time this was asked, once.
pub fn take_failure() -> bool {
    FAILED.swap(false, Ordering::Relaxed)
}

/// Turns off the browser features that do not belong in an app window (plan sections 6.9 and 12),
/// or, in developer mode, turns them back on: the developer tools, the browser's own menu and its
/// shortcuts. It can be called again whenever developer mode changes.
///
/// # Errors
///
/// Returns an error when the window's web engine cannot be reached.
#[cfg(windows)]
#[cfg_attr(debug_assertions, allow(dead_code))]
pub fn harden(window: &WebviewWindow, developer_mode: bool) -> tauri::Result<()> {
    DEVELOPER_MODE.store(developer_mode, Ordering::Relaxed);
    window.with_webview(move |webview| match apply(&webview, developer_mode) {
        Ok(()) => tracing::info!(
            developer_mode,
            "set up the browser features of the web engine"
        ),
        Err(error) => {
            tracing::warn!(%error, "could not set up the browser features of the web engine");
        }
    })
}

/// Only Windows has a web engine to configure.
#[cfg(not(windows))]
#[allow(clippy::unnecessary_wraps)]
#[cfg_attr(debug_assertions, allow(dead_code))]
pub fn harden(_window: &WebviewWindow, _developer_mode: bool) -> tauri::Result<()> {
    Ok(())
}

/// Whether a modifier key is held down now.
#[cfg(windows)]
fn held(virtual_key: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState;

    // SAFETY: GetKeyState only reads the state of the keyboard.
    #[allow(unsafe_code)]
    let state = unsafe { GetKeyState(i32::from(virtual_key.0)) };
    state < 0
}

#[cfg(windows)]
fn apply(
    webview: &tauri::webview::PlatformWebview,
    developer_mode: bool,
) -> windows::core::Result<()> {
    use webview2_com::AcceleratorKeyPressedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN,
        ICoreWebView2Settings3, ICoreWebView2Settings4, ICoreWebView2Settings5,
        ICoreWebView2Settings6,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{VK_CONTROL, VK_MENU, VK_SHIFT};
    use windows::core::Interface;

    let controller = webview.controller();
    // SAFETY: the controller and the settings are live COM objects owned by the web engine, and
    // this runs on the thread that created them. Each call only sets a flag or adds a handler.
    #[allow(unsafe_code)]
    unsafe {
        let settings = controller.CoreWebView2()?.Settings()?;
        // The browser's own menu (Back, Save as, Inspect ...) is replaced by the app's menus,
        // except in developer mode, where it has Inspect.
        settings.SetAreDefaultContextMenusEnabled(developer_mode)?;
        // Nothing to see in a status bar that shows link addresses, and no zoom by mouse wheel:
        // zoom is a setting.
        settings.SetIsStatusBarEnabled(false)?;
        settings.SetIsZoomControlEnabled(false)?;
        // Dev tools are for developer mode, which turns them on when it is on.
        settings.SetAreDevToolsEnabled(developer_mode)?;

        // Reload, print, find, zoom keys, save, view source and the like.
        settings
            .cast::<ICoreWebView2Settings3>()?
            .SetAreBrowserAcceleratorKeysEnabled(developer_mode)?;
        // Nothing the person types is offered back to them.
        let autofill = settings.cast::<ICoreWebView2Settings4>()?;
        autofill.SetIsGeneralAutofillEnabled(false)?;
        autofill.SetIsPasswordAutosaveEnabled(false)?;
        settings
            .cast::<ICoreWebView2Settings5>()?
            .SetIsPinchZoomEnabled(false)?;
        settings
            .cast::<ICoreWebView2Settings6>()?
            .SetIsSwipeNavigationEnabled(false)?;

        // The setting above does not stop every one of these keys when Windows sends them to the
        // window (F5 still reloaded), so the keys are also caught here, before the engine acts.
        if KEYS_CAUGHT.swap(true, Ordering::Relaxed) {
            return Ok(());
        }
        let mut token = Default::default();
        controller.add_AcceleratorKeyPressed(
            &AcceleratorKeyPressedEventHandler::create(Box::new(|_controller, arguments| {
                let Some(arguments) = arguments else {
                    return Ok(());
                };
                if DEVELOPER_MODE.load(Ordering::Relaxed) {
                    return Ok(());
                }
                let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
                arguments.KeyEventKind(&raw mut kind)?;
                if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                    && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
                {
                    return Ok(());
                }
                let mut key = 0;
                arguments.VirtualKey(&raw mut key)?;
                if is_browser_shortcut(key, held(VK_CONTROL), held(VK_SHIFT), held(VK_MENU)) {
                    arguments.SetHandled(true)?;
                }
                Ok(())
            })),
            &raw mut token,
        )?;
    }
    Ok(())
}

/// Reloads the page when the web engine's page process stops or stops answering, and restarts the
/// app when the whole engine is gone. The person is told once the page is back.
///
/// # Errors
///
/// Returns an error when the window's web engine cannot be reached.
#[cfg(windows)]
pub fn recover_from_failures(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle().clone();
    window.with_webview(move |webview| {
        if let Err(error) = watch_failures(&webview, app) {
            tracing::warn!(%error, "could not watch for web engine failures");
        }
    })
}

/// Only Windows has a web engine to recover.
#[cfg(not(windows))]
#[allow(clippy::unnecessary_wraps)]
pub fn recover_from_failures(_window: &WebviewWindow) -> tauri::Result<()> {
    Ok(())
}

#[cfg(windows)]
fn watch_failures(
    webview: &tauri::webview::PlatformWebview,
    app: tauri::AppHandle,
) -> windows::core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    };
    use webview2_com::ProcessFailedEventHandler;

    // SAFETY: the controller and the web view are live COM objects owned by the web engine, and
    // this runs on the thread that created them. The handler only reads the event and reloads.
    #[allow(unsafe_code)]
    unsafe {
        let core = webview.controller().CoreWebView2()?;
        let page = core.clone();
        let mut token = Default::default();
        core.add_ProcessFailed(
            &ProcessFailedEventHandler::create(Box::new(move |_sender, arguments| {
                let Some(arguments) = arguments else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED;
                arguments.ProcessFailedKind(&raw mut kind)?;
                tracing::error!(kind = kind.0, "the web engine failed");
                if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
                    // Nothing is left to reload: the app starts again.
                    crate::restart::request(&app);
                } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
                    || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
                    || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED
                {
                    FAILED.store(true, Ordering::Relaxed);
                    page.Reload()?;
                }
                Ok(())
            })),
            &raw mut token,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_keys_that_reload_the_page_are_browser_shortcuts() {
        assert!(is_browser_shortcut(key::F5, false, false, false));
        assert!(
            is_browser_shortcut(key::F5, true, false, false),
            "hard reload"
        );
        assert!(is_browser_shortcut(key::R, true, false, false));
        assert!(is_browser_shortcut(key::R, true, true, false));
    }

    #[test]
    fn find_print_save_and_view_source_are_browser_shortcuts() {
        for letter in [key::F, key::G, key::P, key::S, key::U, key::O] {
            assert!(
                is_browser_shortcut(letter, true, false, false),
                "{letter:#x}"
            );
        }
        assert!(is_browser_shortcut(key::F3, false, false, false));
    }

    #[test]
    fn the_developer_tools_are_browser_shortcuts() {
        assert!(is_browser_shortcut(key::F12, false, false, false));
        for letter in [key::I, key::J, key::C] {
            assert!(
                is_browser_shortcut(letter, true, true, false),
                "{letter:#x}"
            );
        }
    }

    #[test]
    fn the_shortcuts_of_the_app_are_left_alone() {
        // Ctrl+K (palette), Ctrl+B (sidebar), Ctrl+J (inspector), Ctrl+L (message box), F6, F11.
        assert!(!is_browser_shortcut(0x4B, true, false, false));
        assert!(!is_browser_shortcut(0x42, true, false, false));
        assert!(!is_browser_shortcut(key::J, true, false, false));
        assert!(!is_browser_shortcut(0x4C, true, false, false));
        assert!(!is_browser_shortcut(0x75, false, false, false));
        assert!(!is_browser_shortcut(0x7A, false, false, false));
    }

    #[test]
    fn the_keys_that_edit_text_are_left_alone() {
        // Ctrl+A, C, V, X, Z, Y.
        for letter in [0x41, key::C, 0x56, 0x58, 0x5A, 0x59] {
            assert!(
                !is_browser_shortcut(letter, true, false, false),
                "{letter:#x}"
            );
        }
    }

    #[test]
    fn ordinary_typing_is_left_alone() {
        for letter in [0x41_u32, 0x52, 0x50, 0x53, 0x20, 0x0D] {
            assert!(
                !is_browser_shortcut(letter, false, false, false),
                "{letter:#x}"
            );
            assert!(
                !is_browser_shortcut(letter, false, true, false),
                "{letter:#x}"
            );
        }
    }

    #[test]
    fn shortcuts_with_alt_are_left_alone() {
        // Alt+F4 closes the window and Alt+Left goes back in the app: neither is a browser shortcut.
        assert!(!is_browser_shortcut(key::F5, false, false, true));
        assert!(!is_browser_shortcut(key::R, true, false, true));
    }
}
