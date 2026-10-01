//! Windows 11's Snap Layouts on the title bar's Maximize button (ADR 0009). The page says where its
//! button is; an overlay from `arden-windows` covers it and tells Windows that it is a Maximize
//! button. The overlay takes the button's pointer input, so it also says how the button should look
//! and when it was clicked.

use arden_core::error::AppError;
use arden_windows::snap_layouts::{Area, Event, Look, MaximizeOverlay};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Manager, State, WebviewWindow};
use tauri_specta::Event as _;

/// The overlay over the main window's Maximize button, when Windows made one.
pub struct MaximizeButton(Option<MaximizeOverlay>);

/// Where the page's Maximize button is, in physical pixels from the top left of the page.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct MaximizeButtonArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// How the Maximize button should look while the pointer is on it or presses it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MaximizeButtonLook {
    Normal,
    Hover,
    Pressed,
}

impl From<Look> for MaximizeButtonLook {
    fn from(look: Look) -> Self {
        match look {
            Look::Normal => Self::Normal,
            Look::Hover => Self::Hover,
            Look::Pressed => Self::Pressed,
        }
    }
}

/// Sent to the UI when the Maximize button should look different: the page cannot see the pointer
/// on it, because the overlay takes it.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct MaximizeButtonChanged {
    pub look: MaximizeButtonLook,
}

/// Makes the overlay in the main window, hidden until the page says where its button is. Without it
/// the page's button still works, only without Snap Layouts, so a failure is logged and no more.
pub fn add_overlay(app: &tauri::App) -> MaximizeButton {
    let Some(window) = app.get_webview_window("main") else {
        return MaximizeButton(None);
    };
    let overlay = window
        .hwnd()
        .map_err(|error| error.to_string())
        .and_then(|parent| {
            let target = window.clone();
            MaximizeOverlay::new(parent.0 as isize, move |event| on_event(&target, event))
                .map_err(|error| error.to_string())
        });
    match overlay {
        Ok(overlay) => MaximizeButton(Some(overlay)),
        Err(error) => {
            tracing::warn!(%error, "could not set up Snap Layouts on the Maximize button");
            MaximizeButton(None)
        }
    }
}

/// Passes on what the overlay says: a look for the page to draw, or a click that maximizes or
/// restores the window, as the button's own click does.
fn on_event(window: &WebviewWindow, event: Event) {
    match event {
        Event::Look(look) => {
            let _ = MaximizeButtonChanged { look: look.into() }.emit(window);
        }
        Event::Click => {
            let result = if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            };
            if let Err(error) = result {
                tracing::warn!(%error, "the Maximize button could not maximize or restore the window");
            }
        }
    }
}

/// Where the page's Maximize button is now, or `None` when the page has none, as with the title
/// bar of Windows.
///
/// # Errors
///
/// Never fails: without the overlay the button still works, only without Snap Layouts, so a failure
/// is logged.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn set_maximize_button(
    area: Option<MaximizeButtonArea>,
    button: State<'_, MaximizeButton>,
) -> Result<(), AppError> {
    let Some(overlay) = &button.0 else {
        return Ok(());
    };
    let area = area.map(|area| Area {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
    });
    if let Err(error) = overlay.place(area) {
        tracing::warn!(%error, "could not move the Snap Layouts overlay");
    }
    Ok(())
}
