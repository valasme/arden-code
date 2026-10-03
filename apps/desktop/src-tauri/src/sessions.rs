//! The commands for projects and sessions, and the streaming of a reply into the session view.

// Tauri hands commands their arguments by value; a command that only reads one cannot borrow it.
#![allow(clippy::needless_pass_by_value)]

use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use arden_agents::demo::DemoDriver;
#[cfg(debug_assertions)]
use arden_agents::model::Item;
use arden_agents::model::{AgentKind, Session, SessionList, SessionSummary, TurnEvent};
use arden_agents::playground::PLAYGROUND_ID;
use arden_agents::store::{OpenProblem, SessionStore, StoreError};
use arden_core::error::{AppError, ErrorCode};
use arden_settings::settings::OnStartup;
use tauri::State;
use tauri::ipc::Channel;

/// The session store, shared with the threads that stream replies.
pub type Sessions = Arc<SessionStore>;

/// What the person is told when the store cannot do what was asked.
fn app_error(error: StoreError) -> AppError {
    match error {
        StoreError::UnknownProject | StoreError::UnknownSession => {
            AppError::new(ErrorCode::SessionNotFound)
        }
        StoreError::TurnRunning => AppError::new(ErrorCode::TurnRunning),
        StoreError::InvalidName => AppError::new(ErrorCode::SessionNameInvalid),
        StoreError::Archived => AppError::new(ErrorCode::SessionArchived),
        StoreError::NotSaved(reason) => {
            AppError::new(ErrorCode::SessionsNotSaved).with_details(reason)
        }
        StoreError::NotRead(reason) => {
            AppError::new(ErrorCode::SessionsUnreadable).with_details(reason)
        }
    }
}

/// What went wrong with the sessions file at start, until the page has asked for it.
#[derive(Default)]
pub struct SessionsNotice(Mutex<Option<AppError>>);

impl SessionsNotice {
    /// Logs what went wrong with the sessions file, and keeps it for the page.
    pub fn after(problem: Option<&OpenProblem>) -> Self {
        let notice = match problem {
            None => None,
            Some(OpenProblem::SetAside { kept_as, reason }) => {
                tracing::error!(
                    code = ErrorCode::SessionsUnreadable.as_str(),
                    %reason,
                    kept_as = %kept_as.display(),
                    "the sessions file could not be read, so it was set aside"
                );
                Some(AppError::new(ErrorCode::SessionsUnreadable).with_details(reason.clone()))
            }
            Some(OpenProblem::NotSaving { reason }) => {
                tracing::error!(
                    code = ErrorCode::SessionsNotSaved.as_str(),
                    %reason,
                    "the sessions file could not be opened, so sessions are kept in memory"
                );
                Some(AppError::new(ErrorCode::SessionsNotSaved).with_details(reason.clone()))
            }
        };
        Self(Mutex::new(notice))
    }
}

/// What went wrong with the sessions file at start, if anything. Asking takes it: it is never
/// returned twice.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn take_sessions_notice(
    notice: State<'_, SessionsNotice>,
) -> Result<Option<AppError>, AppError> {
    Ok(notice
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take())
}

/// The projects and their sessions, for the sidebar.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn list_sessions(sessions: State<'_, Sessions>) -> Result<SessionList, AppError> {
    Ok(sessions.list())
}

/// Starts an empty Demo agent session in the Playground.
///
/// # Errors
///
/// Returns an error when the Playground does not exist, or the session cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn create_session(sessions: State<'_, Sessions>) -> Result<SessionSummary, AppError> {
    let session = sessions
        .create_session(PLAYGROUND_ID, AgentKind::Demo)
        .map_err(app_error)?;
    tracing::info!(session = %session.id, "session created");
    Ok(session)
}

/// Starts an empty session linked to another one, in its project and with its agent (ADR 0036).
///
/// # Errors
///
/// Returns an error when there is no session to start from, or the new one cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn create_linked_session(
    from_id: String,
    sessions: State<'_, Sessions>,
) -> Result<SessionSummary, AppError> {
    let session = sessions
        .create_linked_session(&from_id)
        .map_err(app_error)?;
    tracing::info!(session = %session.id, from = %from_id, "linked session created");
    Ok(session)
}

/// A session with all of its turns.
///
/// # Errors
///
/// Returns an error when there is no such session, or its turns cannot be read.
#[tauri::command]
#[specta::specta]
pub fn get_session(id: String, sessions: State<'_, Sessions>) -> Result<Session, AppError> {
    sessions.session(&id).map_err(app_error)
}

/// Remembers that the page opened a session, to open it again at the next start (ADR 0036).
///
/// # Errors
///
/// Returns an error when there is no such session, or it cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn remember_open_session(id: String, sessions: State<'_, Sessions>) -> Result<(), AppError> {
    sessions.remember_open(&id).map_err(app_error)
}

/// Gives a session a name (ADR 0036).
///
/// # Errors
///
/// Returns an error when the name is empty or too long, there is no such session, or the name
/// cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn rename_session(
    id: String,
    name: String,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.rename(&id, &name).map_err(app_error)
}

/// Pins a session to the top of the sidebar, or unpins it (ADR 0036).
///
/// # Errors
///
/// Returns an error when there is no such session, or the change cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn set_session_pinned(
    id: String,
    pinned: bool,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.set_pinned(&id, pinned).map_err(app_error)
}

/// Archives a session, or unarchives it (ADR 0036). Archiving stops a reply that is still running.
///
/// # Errors
///
/// Returns an error when there is no such session, or the change cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn set_session_archived(
    id: String,
    archived: bool,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.set_archived(&id, archived).map_err(app_error)
}

/// Deletes a session for good, after the person confirmed it (ADR 0036). A reply that is still
/// running stops.
///
/// # Errors
///
/// Returns an error when there is no such session, or the file cannot be written.
#[tauri::command]
#[specta::specta]
pub fn delete_session(id: String, sessions: State<'_, Sessions>) -> Result<(), AppError> {
    sessions.delete(&id).map_err(app_error)?;
    tracing::info!(session = %id, "session deleted");
    Ok(())
}

/// Stops the reply that is running in a session. The turn ends as stopped, and the reply's channel
/// is told.
///
/// # Errors
///
/// Returns an error when there is no such session.
#[tauri::command]
#[specta::specta]
pub fn stop_reply(session_id: String, sessions: State<'_, Sessions>) -> Result<(), AppError> {
    sessions.stop_turn(&session_id).map_err(app_error)
}

/// Makes a session with `count` finished turns, to test long conversations. Debug builds only.
///
/// # Errors
///
/// Returns an error when the Playground does not exist, or the session cannot be saved.
#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub fn debug_fill_session(
    count: u32,
    sessions: State<'_, Sessions>,
) -> Result<SessionSummary, AppError> {
    let session = sessions
        .create_session(PLAYGROUND_ID, AgentKind::Demo)
        .map_err(app_error)?;
    let replies = (1..=count)
        .map(|number| {
            (
                format!("Message number {number}"),
                vec![Item::Text {
                    id: format!("filled-{number}"),
                    text: format!(
                        "Reply number {number}. It is a short answer with **bold** text."
                    ),
                }],
            )
        })
        .collect();
    sessions
        .add_finished_turns(&session.id, replies)
        .map_err(app_error)?;
    Ok(session)
}

/// Tells the page that a reply could not be written to the sessions file (ADR 0035). The session
/// holds it until the app closes.
#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct ReplyNotSaved {
    pub notice: AppError,
}

/// Sends a message. The session, with the new turn still running, is returned at once; the reply
/// streams through `on_event` from another thread.
///
/// # Errors
///
/// Returns an error when there is no such session, its agent is still answering, or the message
/// cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn send_message(
    app: tauri::AppHandle,
    session_id: String,
    text: String,
    on_event: Channel<TurnEvent>,
    sessions: State<'_, Sessions>,
) -> Result<Session, AppError> {
    let turn = sessions.start_turn(&session_id, &text).map_err(app_error)?;
    // Taken before the reply starts, so the events that follow never overlap with it.
    let snapshot = sessions.session(&session_id).map_err(app_error)?;

    let store = Arc::clone(sessions.inner());
    let agent = snapshot.agent;
    let running = turn.clone();
    thread::spawn(move || {
        let saved = match agent {
            AgentKind::Demo => {
                store.stream_reply(&DemoDriver::new(), &session_id, &running, |event| {
                    on_event.send(event.clone()).is_ok()
                })
            }
        };
        if let Err(error) = saved {
            use tauri_specta::Event;

            let error = app_error(error);
            tracing::error!(
                code = error.code.as_str(),
                details = error.details.as_deref().unwrap_or_default(),
                session = %session_id,
                turn = %running.id,
                "the reply could not be saved"
            );
            let _ = ReplyNotSaved { notice: error }.emit(&app);
        }
        tracing::debug!(session = %session_id, turn = %running.id, "reply ended");
    });
    Ok(snapshot)
}

/// The session the page should open when it comes up, until it has asked for it: the session that
/// was open last time, or the one made for a folder the app was asked to open. The page may not be
/// there yet when the first launch is asked to open a folder.
#[derive(Default)]
pub struct PendingOpen(Mutex<Option<String>>);

impl PendingOpen {
    /// The session to open at start: the one that was open last time, when the person asked for it
    /// to be restored. A folder opened from the terminal replaces it later.
    pub fn at_start(on_startup: OnStartup, sessions: &SessionStore) -> Self {
        let restored = match on_startup {
            OnStartup::Restore => sessions.last_open(),
            OnStartup::Fresh => None,
        };
        Self(Mutex::new(restored))
    }

    /// The session waiting for the page, taken: it is never handed over twice.
    fn take(&self) -> Option<String> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

/// Tells the page to show a session, such as the one made for a folder that was opened.
#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct SessionRequested {
    pub session_id: String,
}

/// Opens a folder as a project, starts a Demo agent session in it and asks the page to show it.
pub fn open_folder(app: &tauri::AppHandle, folder: &std::path::Path) {
    use tauri::Manager;
    use tauri_specta::Event;

    let store = app.state::<Sessions>();
    let session = store
        .open_folder(folder)
        .and_then(|project| store.create_session(&project.id, AgentKind::Demo));
    let session = match session {
        Ok(session) => session,
        Err(error) => {
            let error = app_error(error);
            tracing::error!(
                code = error.code.as_str(),
                details = error.details.as_deref().unwrap_or_default(),
                "a folder could not be opened as a project"
            );
            return;
        }
    };
    tracing::info!(project = %session.project_id, session = %session.id, "a folder was opened as a project");
    *app.state::<PendingOpen>()
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = Some(session.id.clone());
    let _ = SessionRequested {
        session_id: session.id,
    }
    .emit(app);
}

/// The session the page should show because a folder was opened before the page was ready. Asking
/// takes it: it is never returned twice.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Tauri hands commands their state by value; every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn take_pending_open(pending: State<'_, PendingOpen>) -> Result<Option<String>, AppError> {
    Ok(pending.take())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use arden_agents::playground;

    use super::*;

    fn store_with_a_session_opened() -> (SessionStore, String) {
        let store = SessionStore::new(vec![playground::describe(Path::new(r"C:\Playground"))]);
        let session = store
            .create_session(PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        store.remember_open(&session.id).expect("remembered");
        (store, session.id)
    }

    #[test]
    fn the_session_open_last_time_waits_for_the_page_when_it_is_to_be_restored() {
        let (store, id) = store_with_a_session_opened();

        let pending = PendingOpen::at_start(OnStartup::Restore, &store);

        assert_eq!(pending.take(), Some(id));
        assert_eq!(pending.take(), None, "it is handed over once");
    }

    #[test]
    fn nothing_waits_for_the_page_when_the_person_starts_fresh() {
        let (store, _) = store_with_a_session_opened();

        assert_eq!(PendingOpen::at_start(OnStartup::Fresh, &store).take(), None);
    }
}
