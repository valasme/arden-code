//! The Arden Code desktop app.

mod agents;
mod commands;
mod diagnostics;
mod launch;
mod navigation;
mod notifications;
mod restart;
mod restarter;
mod sessions;
mod settings;
mod snap_layouts;
mod updates;
mod webview;
mod window;
mod window_state;

pub use window::{FIRST_FRAME_GLOBAL, startup_background};

use std::path::{Path, PathBuf};
use std::sync::Arc;

use arden_agents::playground;
use arden_agents::store::SessionStore;
use arden_core::error::ErrorCode;
use arden_core::paths::{AppPaths, DATA_DIR_VARIABLE};
use arden_diagnostics::logging::UiLevel;
use arden_diagnostics::redact::Redactor;
use arden_diagnostics::{crash, logging};
use arden_process::supervisor::Supervisor;
use arden_settings::service::SettingsService;
use arden_settings::settings::{LogLevel, OnStartup, Settings};
use arden_windows::preferences;
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::Event;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands, collect_events};

/// Every command the UI can call. A debug build also has the ones that make test data and
/// failures on purpose.
#[cfg(debug_assertions)]
fn ui_commands() -> tauri_specta::Commands<tauri::Wry> {
    collect_commands![
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
        commands::take_reset_notice,
        commands::restart_app,
        sessions::list_sessions,
        sessions::take_sessions_notice,
        sessions::remember_open_session,
        sessions::rename_session,
        sessions::set_session_pinned,
        sessions::set_session_archived,
        sessions::delete_session,
        sessions::create_session,
        sessions::create_linked_session,
        sessions::get_session,
        sessions::send_message,
        sessions::stop_reply,
        sessions::trust_project,
        sessions::remove_project,
        sessions::answer_approval,
        sessions::answer_questions,
        sessions::take_pending_open,
        sessions::set_session_agent,
        sessions::set_session_model,
        sessions::model_for_new_session,
        sessions::set_session_effort,
        sessions::effort_for_new_session,
        sessions::set_session_permission_mode,
        sessions::permission_mode_for_new_session,
        sessions::set_session_project,
        sessions::pick_folder,
        sessions::agent_for_new_session,
        sessions::claude_catalog,
        agents::detect_agents,
        agents::usage_limits,
        agents::refresh_usage_limits,
        sessions::debug_fill_session,
        agents::debug_spawn_sleeper,
        diagnostics::debug_fail,
        diagnostics::debug_panic,
    ]
}

/// Every command the UI can call.
#[cfg(not(debug_assertions))]
fn ui_commands() -> tauri_specta::Commands<tauri::Wry> {
    collect_commands![
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
        commands::take_reset_notice,
        commands::restart_app,
        sessions::list_sessions,
        sessions::take_sessions_notice,
        sessions::remember_open_session,
        sessions::rename_session,
        sessions::set_session_pinned,
        sessions::set_session_archived,
        sessions::delete_session,
        sessions::create_session,
        sessions::create_linked_session,
        sessions::get_session,
        sessions::send_message,
        sessions::stop_reply,
        sessions::trust_project,
        sessions::remove_project,
        sessions::answer_approval,
        sessions::answer_questions,
        sessions::take_pending_open,
        sessions::set_session_agent,
        sessions::set_session_model,
        sessions::model_for_new_session,
        sessions::set_session_effort,
        sessions::effort_for_new_session,
        sessions::set_session_permission_mode,
        sessions::permission_mode_for_new_session,
        sessions::set_session_project,
        sessions::pick_folder,
        sessions::agent_for_new_session,
        sessions::claude_catalog,
        agents::detect_agents,
        agents::usage_limits,
        agents::refresh_usage_limits,
    ]
}

/// The typed contract between Rust and the UI.
fn specta_builder() -> Builder<tauri::Wry> {
    // A failed command makes the UI's promise reject with its `AppError`, instead of returning a
    // result object.
    let builder = Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        // One shape per type, the one Rust sends, instead of separate "serialize" and "deserialize"
        // versions for types whose fields have defaults.
        .disable_serde_phases();

    builder.commands(ui_commands()).events(collect_events![
        settings::SettingsChanged,
        settings::SystemPreferencesChanged,
        snap_layouts::MaximizeButtonChanged,
        updates::UpdateStatusChanged,
        sessions::SessionRequested,
        sessions::ReplyNotSaved,
        agents::AgentsDetected,
        agents::UsageLimitsChanged,
        sessions::SessionChanged
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

/// The arguments the web engine starts with: the ones Tauri gives every window, the choices about
/// hardware acceleration and smooth scrolling, and in a debug build the port of its debugging
/// endpoint.
#[must_use]
fn browser_arguments(settings: &Settings, debug_port: Option<&str>) -> String {
    let mut arguments =
        String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    if !settings.advanced.hardware_acceleration {
        arguments.push_str(" --disable-gpu");
    }
    if !settings.appearance.smooth_scrolling {
        arguments.push_str(" --disable-smooth-scrolling");
    }
    if let Some(port) = debug_port {
        arguments.push_str(" --remote-debugging-port=");
        arguments.push_str(port);
    }
    arguments
}

/// Makes the main window from its configuration. It is made here, and not by Tauri, so that the
/// web engine's arguments are given in the way that works everywhere (an environment variable for
/// the engine is ignored by some machines, such as a CI runner), so that the page is handed what
/// its first frame needs, and so that the engine keeps its files in the app's `local` folder even
/// when `ARDEN_CODE_DATA_DIR` moves it: a reset wipes them with the rest.
fn create_main_window(
    app: &tauri::App,
    paths: &AppPaths,
    settings: &Settings,
) -> tauri::Result<()> {
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
    let arguments = browser_arguments(settings, debug_port.as_deref());
    tracing::info!(%arguments, "the web engine's arguments");
    let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
        .additional_browser_args(&arguments)
        .data_directory(paths.local.clone());
    let system_preferences = preferences::read().into();
    if let Some(script) = window::first_frame_script(settings, &system_preferences) {
        builder = builder
            .initialization_script(script)
            .on_page_load(window::show_when_first_loaded());
    }
    builder.build()?;
    Ok(())
}

/// Makes the Playground folder on the first launch, and opens the sessions kept in the sessions
/// file (ADR 0035), keeping what went wrong with it, if anything, for the page. The session that
/// was open last time waits for the page, when the person asked for it to be restored.
fn manage_sessions(app: &tauri::App, paths: &AppPaths, on_startup: OnStartup) {
    let folder = paths.playground_dir();
    let playground = playground::ensure(&folder).unwrap_or_else(|error| {
        tracing::error!(%error, "could not create the Playground folder");
        playground::describe(&folder)
    });
    let opened = SessionStore::open(&paths.sessions_file(), &playground);
    app.manage(sessions::SessionsNotice::after(opened.problem.as_ref()));
    app.manage(sessions::PendingOpen::at_start(on_startup, &opened.store));
    let store: sessions::Sessions = Arc::new(opened.store);
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
    let claude = agents::Claude::with(supervisor.as_ref());
    claude.report_usage_to(app.handle(), &app.state::<SettingsService>());
    claude.report_session_changes_to(app.handle(), &app.state::<sessions::Sessions>());
    app.manage(claude);
    app.manage(agents::Programs(supervisor));
    app.manage(agents::Detections::default());
    agents::detect_after_start(app.handle());
}

/// How often a debug build looks at the file that stands in for Windows' settings.
#[cfg(debug_assertions)]
const STAND_IN_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1500);

/// The watch on Windows' text size and regional format, kept for as long as the app runs.
enum PreferencesWatch {
    /// Windows says when one of them changes; nothing runs in between.
    Windows(#[allow(dead_code)] arden_windows::registry::KeyWatcher),
    /// A debug build that stands a file in for Windows looks at the file on a timer.
    #[cfg(debug_assertions)]
    StandIn(#[allow(dead_code)] preferences::Watcher),
    /// Windows could not be watched: changes are seen at the next start.
    Off,
}

/// Tells the UI when the person changes the text size or the regional format in Windows.
fn watch_system_preferences(handle: tauri::AppHandle) -> PreferencesWatch {
    let tell = move |now: &preferences::SystemPreferences| {
        let _ = settings::SystemPreferencesChanged {
            preferences: now.clone().into(),
        }
        .emit(&handle);
    };
    #[cfg(debug_assertions)]
    if std::env::var_os("ARDEN_CODE_SYSTEM_PREFERENCES_FILE").is_some() {
        return PreferencesWatch::StandIn(preferences::Watcher::start(
            preferences::read(),
            STAND_IN_INTERVAL,
            preferences::read,
            tell,
        ));
    }
    match preferences::watch(preferences::read(), tell) {
        Ok(watcher) => PreferencesWatch::Windows(watcher),
        Err(error) => {
            tracing::warn!(%error, "could not watch Windows' text size and regional format");
            PreferencesWatch::Off
        }
    }
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

/// How long a reset keeps trying a file that another program has open for a moment.
const RESET_PATIENCE: std::time::Duration = std::time::Duration::from_secs(3);

/// What happened before the window was made, kept for the logs, which start later.
struct BeforeStart {
    /// When this start replaces another: whether that one, and all it started, ended in time.
    previous_ended: Option<bool>,
    /// Whether a reset that was asked for was done.
    reset: std::io::Result<bool>,
}

impl BeforeStart {
    fn log(&self) {
        if self.previous_ended == Some(false) {
            tracing::warn!("the start this one replaces had not ended in time");
        }
        match &self.reset {
            Ok(true) => tracing::info!("Arden Code reset itself"),
            Ok(false) => {}
            Err(error) => tracing::error!(
                code = ErrorCode::ResetUnfinished.as_str(),
                %error,
                "Arden Code could not finish resetting itself; the next start tries again"
            ),
        }
    }
}

/// What has to happen before the window is made: when this start replaces another, waiting for it
/// to end, and then a reset that was asked for.
fn prepare_before_start() -> BeforeStart {
    let previous_ended = restart::wait_for_previous();
    let reset = arden_core::reset::apply_pending(&early_paths(), RESET_PATIENCE);
    BeforeStart {
        previous_ended,
        reset,
    }
}

/// Starts the app. In a development build, this process becomes the restarter that runs it.
///
/// # Panics
///
/// Panics when the Tauri runtime fails to start.
pub fn run() {
    if restarter::wanted() {
        restarter::run();
    }
    let before_start = prepare_before_start();
    let builder = specta_builder();

    let app = tauri::Builder::default()
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
            before_start.log();
            app.manage(commands::ResetNotice::after(&before_start.reset));
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
            let started_with = settings.get();
            create_main_window(app, &paths, &started_with)?;
            window::prepare_main_window(app, &paths, &started_with)?;
            app.manage(snap_layouts::add_overlay(app));
            app.manage(settings);
            manage_sessions(app, &paths, started_with.general.on_startup);
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
        .build(tauri::generate_context!())
        .expect("failed to run Arden Code");
    let code = app.run_return(|_, _| {});
    restart::finish(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The settings with hardware acceleration and smooth scrolling as given.
    fn settings(hardware_acceleration: bool, smooth_scrolling: bool) -> Settings {
        let mut settings = Settings::default();
        settings.advanced.hardware_acceleration = hardware_acceleration;
        settings.appearance.smooth_scrolling = smooth_scrolling;
        settings
    }

    #[test]
    fn the_web_engine_gets_tauris_own_arguments_and_nothing_else_by_default() {
        assert_eq!(
            browser_arguments(&Settings::default(), None),
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
        );
    }

    #[test]
    fn turning_hardware_acceleration_off_adds_the_argument_that_does_it() {
        let arguments = browser_arguments(&settings(false, true), None);

        assert!(arguments.ends_with(" --disable-gpu"), "{arguments}");
        assert!(!browser_arguments(&settings(true, true), None).contains("--disable-gpu"));
    }

    #[test]
    fn turning_smooth_scrolling_off_adds_the_argument_that_does_it() {
        let arguments = browser_arguments(&settings(true, false), None);

        assert!(
            arguments.ends_with(" --disable-smooth-scrolling"),
            "{arguments}"
        );
        assert!(
            !browser_arguments(&settings(true, true), None).contains("--disable-smooth-scrolling")
        );
    }

    #[test]
    fn a_debug_port_is_added_after_the_others() {
        let arguments = browser_arguments(&settings(false, true), Some("9222"));

        assert!(
            arguments.ends_with(" --disable-gpu --remote-debugging-port=9222"),
            "{arguments}"
        );
    }
}
