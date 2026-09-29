//! The Arden Code desktop app.

mod commands;
mod window;
mod window_state;

pub use window::startup_background;

use std::path::{Path, PathBuf};

use arden_core::paths::{AppPaths, DATA_DIR_VARIABLE};
use arden_diagnostics::redact::Redactor;
use arden_diagnostics::{crash, logging};
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

/// The typed contract between Rust and the UI.
fn specta_builder() -> Builder<tauri::Wry> {
    // A failed command makes the UI's promise reject with its `AppError`, instead of returning a
    // result object.
    let builder = Builder::<tauri::Wry>::new().error_handling(ErrorHandlingMode::Throw);

    #[cfg(debug_assertions)]
    let commands = collect_commands![
        commands::app_info,
        commands::show_system_menu,
        commands::log_from_ui,
        commands::open_logs_folder,
        commands::redact_text,
        commands::debug_fail,
        commands::debug_panic,
    ];
    #[cfg(not(debug_assertions))]
    let commands = collect_commands![
        commands::app_info,
        commands::show_system_menu,
        commands::log_from_ui,
        commands::open_logs_folder,
        commands::redact_text,
    ];

    builder.commands(commands)
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

/// Starts logging and crash reporting, and returns the redactor that removes private details from
/// anything the user might share. Neither is worth stopping the app for if it fails.
fn start_diagnostics(app: &tauri::App, paths: &AppPaths) -> Redactor {
    let home = app.path().home_dir().ok();
    let user_folder = std::env::var("USERPROFILE").ok();
    let profile_folders: Vec<&str> = home
        .as_deref()
        .and_then(Path::to_str)
        .into_iter()
        .chain(user_folder.as_deref())
        .collect();

    let redactor = Redactor::new(&profile_folders);
    crash::install_panic_hook(
        &paths.crashes_dir(),
        env!("CARGO_PKG_VERSION"),
        redactor.clone(),
    );
    if let Err(error) = logging::init(&paths.logs_dir(), &profile_folders) {
        eprintln!("Arden Code could not start logging: {error}");
    } else {
        tracing::info!(version = env!("CARGO_PKG_VERSION"), "Arden Code started");
    }
    redactor
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let paths = resolve_paths(app)?;
            app.manage(start_diagnostics(app, &paths));
            window::prepare_main_window(app, &paths)?;
            app.manage(paths);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Arden Code");
}
