//! The Arden Code desktop app.

mod agents;
mod commands;
mod diagnostics;
mod launch;
mod navigation;
mod notifications;
mod sessions;
mod settings;
mod snap_layouts;
mod updates;
mod webview;
mod window;
mod window_state;

pub use window::startup_background;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use arden_agents::playground;
use arden_agents::store::SessionStore;
use arden_core::paths::{AppPaths, DATA_DIR_VARIABLE};
use arden_diagnostics::logging::UiLevel;
use arden_diagnostics::redact::Redactor;
use arden_diagnostics::{crash, logging};
use arden_process::supervisor::Supervisor;
use arden_settings::service::SettingsService;
use arden_settings::settings::LogLevel;
use arden_windows::preferences;
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::Event;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands, collect_events};

/// The typed contract between Rust and the UI.
fn specta_builder() -> Builder<tauri::Wry> {
    // A failed command makes the UI's promise reject with its `AppError`, instead of returning a
    // result object.
    let builder = Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        // One shape per type, the one Rust sends, instead of separate "serialize" and "deserialize"
        // versions for types whose fields have defaults.
        .disable_serde_phases();

    #[cfg(debug_assertions)]
    let commands = collect_commands![
        commands::app_info,
        commands::show_system_menu,
        snap_layouts::set_maximize_button,
        diagnostics::log_from_ui,
        diagnostics::open_logs_folder,
        diagnostics::redact_text,
        settings::get_settings,
        settings::change_setting,
        settings::reset_setting,
        settings::set_shortcuts,
        settings::reset_shortcuts,
        settings::take_settings_notice,
        settings::get_system_preferences,
        commands::get_system_info,
        settings::open_settings_file,
        commands::open_project_page,
        commands::open_link,
        updates::get_update_status,
        updates::check_for_updates,
        updates::restart_to_update,
        commands::send_test_notification,
        diagnostics::open_bug_report,
        diagnostics::read_logs,
        diagnostics::export_diagnostics,
        diagnostics::pending_crashes,
        diagnostics::acknowledge_crashes,
        diagnostics::take_web_engine_notice,
        settings::export_settings,
        settings::import_settings,
        settings::reset_settings,
        commands::reset_app,
        commands::restart_app,
        sessions::list_projects,
        sessions::create_session,
        sessions::get_session,
        sessions::send_message,
        sessions::stop_reply,
        sessions::take_pending_open,
        agents::detect_agents,
        sessions::debug_fill_session,
        agents::debug_spawn_sleeper,
        diagnostics::debug_fail,
        diagnostics::debug_panic,
    ];
    #[cfg(not(debug_assertions))]
    let commands = collect_commands![
        commands::app_info,
        commands::show_system_menu,
        snap_layouts::set_maximize_button,
        diagnostics::log_from_ui,
        diagnostics::open_logs_folder,
        diagnostics::redact_text,
        settings::get_settings,
        settings::change_setting,
        settings::reset_setting,
        settings::set_shortcuts,
        settings::reset_shortcuts,
        settings::take_settings_notice,
        settings::get_system_preferences,
        commands::get_system_info,
        settings::open_settings_file,
        commands::open_project_page,
        commands::open_link,
        updates::get_update_status,
        updates::check_for_updates,
        updates::restart_to_update,
        commands::send_test_notification,
        diagnostics::open_bug_report,
        diagnostics::read_logs,
        diagnostics::export_diagnostics,
        diagnostics::pending_crashes,
        diagnostics::acknowledge_crashes,
        diagnostics::take_web_engine_notice,
        settings::export_settings,
        settings::import_settings,
        settings::reset_settings,
        commands::reset_app,
        commands::restart_app,
        sessions::list_projects,
        sessions::create_session,
        sessions::get_session,
        sessions::send_message,
        sessions::stop_reply,
        sessions::take_pending_open,
        agents::detect_agents,
    ];

    builder.commands(commands).events(collect_events![
        settings::SettingsChanged,
        settings::SystemPreferencesChanged,
        snap_layouts::MaximizeButtonChanged,
        updates::UpdateStatusChanged,
        sessions::SessionRequested
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

/// The TypeScript module that holds the settings' defaults. Rust decides them; the UI shows these
/// only where there is no Rust to ask, such as a plain browser during development.
///
/// # Panics
///
/// Never in practice: the defaults are plain data that always serialize.
#[must_use]
pub fn defaults_module() -> String {
    let defaults = serde_json::to_string_pretty(&arden_settings::settings::Settings::default())
        .expect("the defaults are JSON");
    format!(
        "// Generated by `pnpm bindings` from the defaults in arden-settings. Do not edit.\nimport type {{ Settings }} from \"./bindings\";\n\nexport const defaultSettings: Settings = {defaults};\n"
    )
}

/// Writes [`defaults_module`] to `path`.
///
/// # Errors
///
/// Returns an error when the file cannot be written.
pub fn export_defaults(path: &Path) -> std::io::Result<()> {
    std::fs::write(path, defaults_module())
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
fn start_diagnostics(app: &tauri::App, paths: &AppPaths, level: UiLevel) -> Redactor {
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
    if let Err(error) = logging::init(&paths.logs_dir(), &profile_folders, level) {
        eprintln!("Arden Code could not start logging: {error}");
    } else {
        tracing::info!(version = env!("CARGO_PKG_VERSION"), "Arden Code started");
    }
    redactor
}

/// The variable that sets the port of the web engine's debugging endpoint. Debug builds only.
#[cfg(debug_assertions)]
const DEBUG_PORT_VARIABLE: &str = "ARDEN_CODE_DEBUG_PORT";

/// The arguments the web engine starts with: the ones Tauri gives every window, the choice about
/// hardware acceleration, and in a debug build the port of its debugging endpoint.
#[must_use]
fn browser_arguments(hardware_acceleration: bool, debug_port: Option<&str>) -> String {
    let mut arguments =
        String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    if !hardware_acceleration {
        arguments.push_str(" --disable-gpu");
    }
    if let Some(port) = debug_port {
        arguments.push_str(" --remote-debugging-port=");
        arguments.push_str(port);
    }
    arguments
}

/// Makes the main window from its configuration. It is made here, and not by Tauri, so that the
/// web engine's arguments are given in the way that works everywhere: an environment variable for
/// the engine is ignored by some machines, such as a CI runner.
fn create_main_window(app: &tauri::App, hardware_acceleration: bool) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or(tauri::Error::WindowNotFound)?;
    #[cfg(debug_assertions)]
    let debug_port = std::env::var(DEBUG_PORT_VARIABLE).ok();
    #[cfg(not(debug_assertions))]
    let debug_port: Option<String> = None;
    let arguments = browser_arguments(hardware_acceleration, debug_port.as_deref());
    tracing::info!(%arguments, "the web engine's arguments");
    tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
        .additional_browser_args(&arguments)
        .build()?;
    Ok(())
}

/// Makes the Playground folder on the first launch, and starts the store of sessions.
fn manage_sessions(app: &tauri::App, paths: &AppPaths) {
    let folder = paths.playground_dir();
    let playground = playground::ensure(&folder).unwrap_or_else(|error| {
        tracing::error!(%error, "could not create the Playground folder");
        playground::describe(&folder)
    });
    let store: sessions::Sessions = Arc::new(SessionStore::new(vec![playground]));
    app.manage(store);
}

/// Starts the supervisor that keeps the agent programs in a job with the app.
fn manage_programs(app: &tauri::App, paths: &AppPaths) {
    let supervisor = match Supervisor::new(paths.logs_dir().join("agents")) {
        Ok(supervisor) => Some(Arc::new(supervisor)),
        Err(error) => {
            tracing::error!(%error, "could not make the job for agent programs");
            None
        }
    };
    app.manage(agents::Programs(supervisor));
}

/// How often Windows' text size and regional format are looked at for a change.
const SYSTEM_PREFERENCES_INTERVAL: Duration = Duration::from_millis(1500);

/// Tells the UI when the person changes the text size or the regional format in Windows.
fn watch_system_preferences(handle: tauri::AppHandle) -> preferences::Watcher {
    preferences::Watcher::start(
        preferences::read(),
        SYSTEM_PREFERENCES_INTERVAL,
        preferences::read,
        move |now| {
            let _ = settings::SystemPreferencesChanged {
                preferences: now.clone().into(),
            }
            .emit(&handle);
        },
    )
}

/// What the log level setting means to the logging.
const fn ui_level(level: LogLevel) -> UiLevel {
    match level {
        LogLevel::Error => UiLevel::Error,
        LogLevel::Warn => UiLevel::Warn,
        LogLevel::Info => UiLevel::Info,
        LogLevel::Debug => UiLevel::Debug,
    }
}

/// The folders of the app's files, worked out from Windows' environment. The window does not exist
/// yet when this is needed, so Tauri cannot be asked.
fn early_paths() -> AppPaths {
    let folder =
        |name: &str| std::env::var_os(name).map_or_else(|| PathBuf::from("."), PathBuf::from);
    AppPaths::resolve(
        std::env::var_os(DATA_DIR_VARIABLE)
            .map(PathBuf::from)
            .as_deref(),
        &folder("APPDATA"),
        &folder("LOCALAPPDATA"),
    )
}

/// What has to happen before the window is made: a reset that was asked for.
fn prepare_before_start() {
    let paths = early_paths();
    if let Err(error) = arden_core::reset::apply_pending(&paths) {
        eprintln!("Arden Code could not finish resetting itself: {error}");
    }
}

/// Starts the app.
///
/// # Panics
///
/// Panics when the Tauri runtime fails to start.
pub fn run() {
    prepare_before_start();
    let builder = specta_builder();

    tauri::Builder::default()
        // This plugin must come first. A second launch ends here and brings the first window forward.
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, working_directory| {
                if let Some(folder) = launch::folder_to_open(
                    &arguments,
                    Some(std::path::Path::new(&working_directory)),
                ) {
                    sessions::open_folder(app, &folder);
                }
                window::focus_main_window(app);
            },
        ))
        .plugin(navigation::guard())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .on_page_load(|_webview, payload| {
            tracing::info!(url = %payload.url(), event = ?payload.event(), "page load");
        })
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let paths = resolve_paths(app)?;
            // Logging starts before the settings service, so the level is read from the file.
            let log_level = arden_settings::store::peek(&paths.config)
                .map_or(LogLevel::default(), |settings| settings.advanced.log_level);
            app.manage(start_diagnostics(app, &paths, ui_level(log_level)));
            let settings = SettingsService::start(&paths.config);
            let handle = app.handle().clone();
            settings.subscribe(move |settings, notice| {
                window::apply_native_theme(&handle, settings.appearance.theme);
                window::apply_advanced(&handle, &settings.advanced);
                logging::set_level(ui_level(settings.advanced.log_level));
                tracing::debug!("settings changed");
                let _ = settings::SettingsChanged {
                    settings: settings.clone(),
                    notice: notice.cloned(),
                }
                .emit(&handle);
            });
            create_main_window(app, settings.get().advanced.hardware_acceleration)?;
            window::prepare_main_window(app, &paths, &settings.get())?;
            app.manage(snap_layouts::add_overlay(app));
            app.manage(settings);
            manage_sessions(app, &paths);
            app.manage(sessions::PendingOpen::default());
            manage_programs(app, &paths);
            app.manage(updates::Updates::default());
            app.manage(paths);
            app.manage(watch_system_preferences(app.handle().clone()));
            updates::start(app.handle().clone());
            // The terminal command starts the app with a folder to open.
            let arguments: Vec<String> = std::env::args().collect();
            if let Some(folder) =
                launch::folder_to_open(&arguments, std::env::current_dir().ok().as_deref())
            {
                sessions::open_folder(app.handle(), &folder);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Arden Code");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_web_engine_gets_tauris_own_arguments_and_nothing_else_by_default() {
        assert_eq!(
            browser_arguments(true, None),
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
        );
    }

    #[test]
    fn turning_hardware_acceleration_off_adds_the_argument_that_does_it() {
        let arguments = browser_arguments(false, None);

        assert!(arguments.ends_with(" --disable-gpu"), "{arguments}");
        assert!(!browser_arguments(true, None).contains("--disable-gpu"));
    }

    #[test]
    fn a_debug_port_is_added_after_the_others() {
        let arguments = browser_arguments(false, Some("9222"));

        assert!(
            arguments.ends_with(" --disable-gpu --remote-debugging-port=9222"),
            "{arguments}"
        );
    }
}
