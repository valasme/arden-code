//! The Arden Code desktop app.

mod commands;
mod window;

pub use window::startup_background;

use std::path::Path;

use specta_typescript::Typescript;
use tauri_specta::{Builder, collect_commands};

/// The typed contract between Rust and the UI.
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![commands::app_info])
}

/// Writes the TypeScript bindings for every command to `path`.
///
/// # Errors
///
/// Returns an error when the bindings cannot be generated or written.
pub fn export_bindings(path: &Path) -> Result<(), specta_typescript::Error> {
    specta_builder().export(Typescript::default(), path)
}

/// Starts the app.
///
/// # Panics
///
/// Panics when the Tauri runtime fails to start.
pub fn run() {
    let builder = specta_builder();

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            window::prepare_main_window(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Arden Code");
}
