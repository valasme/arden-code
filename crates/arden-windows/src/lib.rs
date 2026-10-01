//! Windows integration for Arden Code.

pub mod placement;
pub mod preferences;
#[cfg(windows)]
pub mod process;
#[cfg(windows)]
pub mod registry;
#[cfg(windows)]
pub mod snap_layouts;
pub mod store;
#[cfg(windows)]
pub mod system_menu;
