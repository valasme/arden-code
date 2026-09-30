//! The commands for projects and sessions, and the streaming of a reply into the session view.

// Tauri hands commands their arguments by value; a command that only reads one cannot borrow it.
#![allow(clippy::needless_pass_by_value)]

use std::sync::Arc;
use std::thread;

use arden_agents::demo::DemoDriver;
#[cfg(debug_assertions)]
use arden_agents::model::Item;
use arden_agents::model::{AgentKind, ProjectListing, Session, SessionSummary, TurnEvent};
use arden_agents::playground::PLAYGROUND_ID;
use arden_agents::store::{SessionStore, StoreError};
use arden_core::error::{AppError, ErrorCode};
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
    }
}

/// The projects and their sessions, for the sidebar.
#[tauri::command]
#[specta::specta]
pub fn list_projects(sessions: State<'_, Sessions>) -> Vec<ProjectListing> {
    sessions.projects()
}

/// Starts an empty Demo agent session in the Playground.
///
/// # Errors
///
/// Returns an error when the Playground does not exist.
#[tauri::command]
#[specta::specta]
pub fn create_session(sessions: State<'_, Sessions>) -> Result<SessionSummary, AppError> {
    let session = sessions
        .create_session(PLAYGROUND_ID, AgentKind::Demo)
        .map_err(app_error)?;
    tracing::info!(session = %session.id, "session created");
    Ok(session)
}

/// A session with all of its turns.
///
/// # Errors
///
/// Returns an error when there is no such session.
#[tauri::command]
#[specta::specta]
pub fn get_session(id: String, sessions: State<'_, Sessions>) -> Result<Session, AppError> {
    sessions
        .session(&id)
        .ok_or_else(|| AppError::new(ErrorCode::SessionNotFound))
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
/// Returns an error when the Playground does not exist.
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
    for number in 1..=count {
        let reply = Item::Text {
            id: format!("filled-{number}"),
            text: format!("Reply number {number}. It is a short answer with **bold** text."),
        };
        sessions
            .add_finished_turn(
                &session.id,
                &format!("Message number {number}"),
                vec![reply],
            )
            .map_err(app_error)?;
    }
    Ok(session)
}

/// Sends a message. The session, with the new turn still running, is returned at once; the reply
/// streams through `on_event` from another thread.
///
/// # Errors
///
/// Returns an error when there is no such session, or its agent is still answering.
#[tauri::command]
#[specta::specta]
pub fn send_message(
    session_id: String,
    text: String,
    on_event: Channel<TurnEvent>,
    sessions: State<'_, Sessions>,
) -> Result<Session, AppError> {
    let session = sessions
        .session(&session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SessionNotFound))?;
    let turn = sessions.start_turn(&session_id, &text).map_err(app_error)?;
    // Taken before the reply starts, so the events that follow never overlap with it.
    let snapshot = sessions
        .session(&session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SessionNotFound))?;

    let store = Arc::clone(sessions.inner());
    let running = turn.clone();
    thread::spawn(move || {
        match session.agent {
            AgentKind::Demo => {
                store.stream_reply(&DemoDriver::new(), &session_id, &running, |event| {
                    on_event.send(event.clone()).is_ok()
                });
            }
        }
        tracing::debug!(session = %session_id, turn = %running.id, "reply ended");
    });
    Ok(snapshot)
}
