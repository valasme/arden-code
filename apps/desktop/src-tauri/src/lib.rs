//! The Arden Code desktop app.

mod commands;
mod window;
mod window_state;

pub use window::startup_background;

use std::path::{Path, PathBuf};

use arden_core::paths::{AppPaths, DATA_DIR_VARIABLE};
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

/// The typed contract between Rust and the UI.
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        // A failed command makes the UI's promise reject, instead of returning a result object.
        .error_handling(ErrorHandlingMode::Throw)
        .commands(collect_commands![
            commands::app_info,
            commands::show_system_menu
        ])
}

/// Writes the TypeScript bindings for every command to `path`.
///
/// # Errors
///
/// Returns an error when the bindings cannot be generated or written.
pub fn export_bindings(path: &Path) -> Result<(), specta_typescript::Error> {
    specta_builder().export(Typescript::default(), path)
}

/// Where the app keeps its files: Windows' data folders, unless `ARDEN_CODE_DATA_DIR` points elsewhere.
fn resolve_paths(app: &tauri::App) -> tauri::Result<AppPaths> {
    let data_dir = std::env::var_os(DATA_DIR_VARIABLE).map(PathBuf::from);
    Ok(AppPaths::resolve(
        data_dir.as_deref(),
        &app.path().config_dir()?,
        &app.path().local_data_dir()?,
    ))
}

/// Starts the app.
///
/// # Panics
///
/// Panics when the Tauri runtime fails to start.
pub fn run() {
    let builder = specta_builder();

    tauri::Builder::default()
        // This plugin must come first. A second launch ends here and brings the first window forward.
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _working_directory| {
                window::focus_main_window(app);
            },
        ))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let paths = resolve_paths(app)?;
            window::prepare_main_window(app, &paths)?;
            app.manage(paths);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Arden Code");
}
