//! Remembering where the main window was, and opening it there next time.
//!
//! The decisions (what counts as on screen, how to keep the size at a new display scaling) live in
//! `arden_windows::placement` and are unit tested. This file only connects them to Tauri.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use arden_windows::placement::{Monitor, Placement, Rect, WindowState, restore};
use arden_windows::store;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

/// The size of the window the first time, in logical pixels.
const DEFAULT_LOGICAL_SIZE: (u32, u32) = (1280, 800);

/// How long the window must stay still before its place is written to disk.
const SAVE_DELAY: Duration = Duration::from_millis(500);

/// The monitors, primary first, in the form the placement logic uses.
fn monitors(app: &AppHandle) -> tauri::Result<Vec<Monitor>> {
    let convert = |monitor: &tauri::Monitor| {
        let area = monitor.work_area();
        Monitor::new(
            Rect::new(
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
            ),
            monitor.scale_factor(),
        )
    };

    let mut result: Vec<Monitor> = Vec::new();
    if let Some(primary) = app.primary_monitor()? {
        result.push(convert(&primary));
    }
    for monitor in app.available_monitors()? {
        let candidate = convert(&monitor);
        if !result.contains(&candidate) {
            result.push(candidate);
        }
    }
    Ok(result)
}

/// The smallest size the window can be made, in logical pixels: the `minWidth` and `minHeight` of
/// its entry in `tauri.conf.json` (ADR 0009). None set is no smallest size.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn smallest_logical_size(window: &WebviewWindow) -> (u32, u32) {
    window
        .app_handle()
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window.label())
        .map_or((0, 0), |config| {
            // Window sizes are small and never negative.
            (
                config.min_width.unwrap_or(0.0).round() as u32,
                config.min_height.unwrap_or(0.0).round() as u32,
            )
        })
}

/// Moves and sizes the (still hidden) window to where it was last time, or to a sensible default.
///
/// # Errors
///
/// Returns an error when the monitors or the window cannot be read or changed.
pub fn restore_window(
    app: &AppHandle,
    window: &WebviewWindow,
    state_file: &std::path::Path,
) -> tauri::Result<Placement> {
    let saved = store::load(state_file);
    let placement = restore(
        saved.as_ref(),
        &monitors(app)?,
        DEFAULT_LOGICAL_SIZE,
        smallest_logical_size(window),
    );

    let Rect {
        x,
        y,
        width,
        height,
    } = placement.rect;
    window.set_position(PhysicalPosition::new(x, y))?;
    set_outer_size(window, width, height)?;
    if placement.maximized {
        window.maximize()?;
    }
    Ok(placement)
}

/// Gives the window an outer size of exactly `width` x `height`.
///
/// Tauri's `set_size` sets the inner size, and a window without a title bar has an invisible border
/// whose size Tauri does not account for consistently. So this sets the size, measures what came out,
/// and corrects for the difference until the outer size is right.
fn set_outer_size(window: &WebviewWindow, width: u32, height: u32) -> tauri::Result<()> {
    window.set_size(PhysicalSize::new(width, height))?;
    for _ in 0..3 {
        let outer = window.outer_size()?;
        if (outer.width, outer.height) == (width, height) {
            break;
        }
        let inner = window.inner_size()?;
        let adjust = |inner: u32, outer: u32, wanted: u32| {
            u32::try_from((i64::from(inner) + i64::from(wanted) - i64::from(outer)).max(1))
                .unwrap_or(wanted)
        };
        window.set_size(PhysicalSize::new(
            adjust(inner.width, outer.width, width),
            adjust(inner.height, outer.height, height),
        ))?;
    }
    Ok(())
}

/// Reads the window's current place. Returns `None` while it is minimized, because Windows then
/// reports a meaningless position.
fn capture(window: &WebviewWindow, normal: &Rect) -> Option<(Rect, bool)> {
    if window.is_minimized().ok()? {
        return None;
    }
    let maximized = window.is_maximized().ok()?;
    if maximized {
        // A maximized window remembers the bounds it will return to when restored.
        return Some((*normal, true));
    }
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some((
        Rect::new(position.x, position.y, size.width, size.height),
        false,
    ))
}

/// Grows the window back to its smallest size whenever something makes it smaller (#128).
///
/// Windows stops a person's drag at the smallest size the window gives it, but a program that sizes
/// the window itself, such as a window tool, can go below it, since the window draws its own frame.
pub fn keep_smallest_size(window: &WebviewWindow) {
    let (smallest_width, smallest_height) = smallest_logical_size(window);
    let watched = window.clone();
    window.on_window_event(move |event| {
        let WindowEvent::Resized(_) = event else {
            return;
        };
        if watched.is_minimized().unwrap_or(true) || watched.is_maximized().unwrap_or(true) {
            return;
        }
        let (Ok(outer), Ok(scale)) = (watched.outer_size(), watched.scale_factor()) else {
            return;
        };
        let smallest = PhysicalSize::<u32>::from_logical::<_, f64>(
            (f64::from(smallest_width), f64::from(smallest_height)),
            scale,
        );
        if outer.width >= smallest.width && outer.height >= smallest.height {
            return;
        }
        let width = outer.width.max(smallest.width);
        let height = outer.height.max(smallest.height);
        // Sized again away from the event, which it would otherwise be sizing from within.
        let window = watched.clone();
        std::thread::spawn(move || {
            let _ = set_outer_size(&window, width, height);
        });
    });
}

/// Starts saving the window's place whenever it changes, and once more when it closes.
pub fn remember_window(window: &WebviewWindow, initial: Placement, state_file: &Path) {
    let current = Arc::new(Mutex::new((initial.rect, initial.maximized)));
    let (notify, changes) = mpsc::channel::<()>();

    let snapshot = {
        let current = Arc::clone(&current);
        let state_file: PathBuf = state_file.to_path_buf();
        let window = window.clone();
        move || {
            let (rect, maximized) = *current.lock().expect("window state lock");
            let scale_factor = window.scale_factor().unwrap_or(1.0);
            let state = WindowState {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                scale_factor,
                maximized,
            };
            // Failing to remember the window is not worth interrupting the user for.
            let _ = store::save(&state_file, &state);
        }
    };

    // Waits for the window to stop moving or resizing, then saves once.
    let save_when_still = snapshot.clone();
    std::thread::spawn(move || {
        while changes.recv().is_ok() {
            loop {
                match changes.recv_timeout(SAVE_DELAY) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            save_when_still();
        }
    });

    let watched = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::ScaleFactorChanged { .. } => {
            let mut current = current.lock().expect("window state lock");
            if let Some(next) = capture(&watched, &current.0) {
                *current = next;
                let _ = notify.send(());
            }
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => snapshot(),
        _ => {}
    });
}
