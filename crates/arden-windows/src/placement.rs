//! Where the main window opens: the last place it was, moved back on screen if it no longer fits.

use serde::{Deserialize, Serialize};

/// A rectangle in physical pixels, on the virtual screen that spans all monitors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    #[must_use]
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    fn right(&self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(&self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }

    /// The part of this rectangle that also lies inside `other`, as (width, height).
    fn overlap(&self, other: &Rect) -> (i64, i64) {
        let width = self.right().min(other.right()) - i64::from(self.x).max(i64::from(other.x));
        let height = self.bottom().min(other.bottom()) - i64::from(self.y).max(i64::from(other.y));
        (width.max(0), height.max(0))
    }

    fn overlap_area(&self, other: &Rect) -> i64 {
        let (width, height) = self.overlap(other);
        width * height
    }
}

/// A monitor's usable area (without the taskbar) and its display scaling.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    pub work_area: Rect,
    /// 1.0 at 100% scaling, 1.5 at 150%, and so on.
    pub scale_factor: f64,
}

impl Monitor {
    #[must_use]
    pub const fn new(work_area: Rect, scale_factor: f64) -> Self {
        Self {
            work_area,
            scale_factor,
        }
    }
}

/// What is remembered about the window between launches. Sizes are in physical pixels at the
/// scaling in `scale_factor`; a maximized window keeps the bounds it had before maximizing.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub maximized: bool,
}

/// Where and how to open the window.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub rect: Rect,
    pub maximized: bool,
}

/// How much of the title bar (in logical pixels) must be on screen for the window to be draggable.
const REACHABLE_WIDTH: f64 = 100.0;
const REACHABLE_HEIGHT: f64 = 16.0;
const TITLE_BAR_HEIGHT: f64 = 32.0;

/// Scales a length in logical pixels to physical pixels.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn physical(logical: f64, scale: f64) -> u32 {
    // Window sizes are far below u32::MAX, and never negative.
    (logical * scale).round().max(0.0) as u32
}

/// Works out where to open the window.
///
/// The first monitor in `monitors` is the primary one. A remembered position is kept when the
/// window's title bar can still be reached on some monitor; otherwise the window is centered on the
/// monitor it was mostly on, or on the primary one. A window bigger than its monitor is shrunk to fit.
#[must_use]
pub fn restore(
    state: Option<&WindowState>,
    monitors: &[Monitor],
    default_logical_size: (u32, u32),
) -> Placement {
    let Some(primary) = monitors.first() else {
        let (width, height) = default_logical_size;
        return Placement {
            rect: Rect::new(0, 0, width, height),
            maximized: false,
        };
    };

    let saved_rect = state.map(|s| Rect::new(s.x, s.y, s.width, s.height));
    let monitor = saved_rect
        .and_then(|rect| {
            monitors
                .iter()
                .map(|monitor| (monitor, rect.overlap_area(&monitor.work_area)))
                .filter(|(_, area)| *area > 0)
                .max_by_key(|(_, area)| *area)
                .map(|(monitor, _)| monitor)
        })
        .unwrap_or(primary);

    // The size the user saw, kept the same at the monitor's current scaling.
    let (logical_width, logical_height) = state.map_or(
        (
            f64::from(default_logical_size.0),
            f64::from(default_logical_size.1),
        ),
        |s| {
            (
                f64::from(s.width) / s.scale_factor,
                f64::from(s.height) / s.scale_factor,
            )
        },
    );
    let area = monitor.work_area;
    let width = physical(logical_width, monitor.scale_factor).min(area.width);
    let height = physical(logical_height, monitor.scale_factor).min(area.height);

    let centered = |size: u32, origin: i32, available: u32| {
        i32::try_from((i64::from(available) - i64::from(size)) / 2 + i64::from(origin))
            .unwrap_or(origin)
    };

    let position = match state {
        Some(s) if title_bar_is_reachable(Rect::new(s.x, s.y, width, height), monitors) => {
            // A window that had to shrink starts at the monitor's edge so it fits.
            let x = if width == area.width { area.x } else { s.x };
            let y = if height == area.height { area.y } else { s.y };
            (x, y)
        }
        _ => (
            centered(width, area.x, area.width),
            centered(height, area.y, area.height),
        ),
    };

    Placement {
        rect: Rect::new(position.0, position.1, width, height),
        maximized: state.is_some_and(|s| s.maximized),
    }
}

/// Whether enough of the window's title bar is on some monitor to grab it with the mouse.
fn title_bar_is_reachable(window: Rect, monitors: &[Monitor]) -> bool {
    monitors.iter().any(|monitor| {
        let strip = Rect::new(
            window.x,
            window.y,
            window.width,
            physical(TITLE_BAR_HEIGHT, monitor.scale_factor),
        );
        let (width, height) = strip.overlap(&monitor.work_area);
        #[allow(clippy::cast_precision_loss)]
        let (width, height) = (width as f64, height as f64);
        width >= REACHABLE_WIDTH * monitor.scale_factor
            && height >= REACHABLE_HEIGHT * monitor.scale_factor
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const HD: Monitor = Monitor::new(Rect::new(0, 0, 1920, 1040), 1.0);

    fn state(x: i32, y: i32, width: u32, height: u32) -> WindowState {
        WindowState {
            x,
            y,
            width,
            height,
            scale_factor: 1.0,
            maximized: false,
        }
    }

    #[test]
    fn opens_where_it_was_when_that_is_still_on_screen() {
        let placement = restore(Some(&state(200, 100, 1280, 800)), &[HD], (1280, 800));

        assert_eq!(placement.rect, Rect::new(200, 100, 1280, 800));
        assert!(!placement.maximized);
    }

    #[test]
    fn opens_centered_at_the_default_size_the_first_time() {
        let placement = restore(None, &[HD], (1280, 800));

        assert_eq!(placement.rect, Rect::new(320, 120, 1280, 800));
    }

    #[test]
    fn remembers_that_the_window_was_maximized() {
        let mut saved = state(200, 100, 1280, 800);
        saved.maximized = true;

        assert!(restore(Some(&saved), &[HD], (1280, 800)).maximized);
    }

    #[test]
    fn moves_a_window_back_when_its_monitor_is_gone() {
        // It was on a second monitor to the right, which is no longer connected.
        let placement = restore(Some(&state(2500, 200, 1000, 700)), &[HD], (1280, 800));

        assert_eq!(placement.rect, Rect::new(460, 170, 1000, 700));
    }

    #[test]
    fn keeps_a_window_that_hangs_partly_off_screen_but_can_still_be_grabbed() {
        // Half of the window is off the right edge, but its title bar is easy to reach.
        let placement = restore(Some(&state(1500, 100, 800, 600)), &[HD], (1280, 800));

        assert_eq!(placement.rect.x, 1500);
    }

    #[test]
    fn moves_a_window_whose_title_bar_is_off_screen() {
        // The title bar is above the top edge, so the window cannot be dragged.
        let placement = restore(Some(&state(300, -400, 800, 600)), &[HD], (1280, 800));

        assert_eq!(placement.rect, Rect::new(560, 220, 800, 600));
    }

    #[test]
    fn shrinks_a_window_that_is_bigger_than_the_screen() {
        let placement = restore(Some(&state(0, 0, 3000, 2000)), &[HD], (1280, 800));

        assert_eq!(placement.rect, Rect::new(0, 0, 1920, 1040));
    }

    #[test]
    fn keeps_the_size_the_user_saw_when_the_display_scaling_changed() {
        // Saved at 100% as 1000 x 700; the monitor is now at 150%, so it needs 1500 x 1050 pixels.
        let monitor = Monitor::new(Rect::new(0, 0, 3840, 2120), 1.5);
        let placement = restore(Some(&state(200, 100, 1000, 700)), &[monitor], (1280, 800));

        assert_eq!((placement.rect.width, placement.rect.height), (1500, 1050));
    }

    #[test]
    fn prefers_the_monitor_the_window_was_mostly_on() {
        let left = Monitor::new(Rect::new(-1920, 0, 1920, 1040), 1.0);
        // On the left monitor, but so far off the bottom that the title bar would be lost.
        let placement = restore(
            Some(&state(-1500, 2000, 800, 600)),
            &[HD, left],
            (1280, 800),
        );

        assert!(
            placement.rect.x >= 0,
            "falls back to the primary monitor: {placement:?}"
        );
    }

    #[test]
    fn keeps_a_window_on_a_second_monitor_with_negative_coordinates() {
        let left = Monitor::new(Rect::new(-1920, 0, 1920, 1040), 1.0);
        let placement = restore(
            Some(&state(-1700, 100, 1000, 700)),
            &[HD, left],
            (1280, 800),
        );

        assert_eq!(placement.rect, Rect::new(-1700, 100, 1000, 700));
    }
}
