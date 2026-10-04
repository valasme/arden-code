//! The commands for projects and sessions, and the streaming of a reply into the session view.

// Tauri hands commands their arguments by value; a command that only reads one cannot borrow it.
#![allow(clippy::needless_pass_by_value)]

use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use arden_agents::demo::DemoDriver;
use arden_agents::driver::{AgentDriver, Answer};
use arden_agents::model::{
    AgentKind, ApprovalAction, ApprovalState, Item, Model, Project, QuestionAnswer, QuestionState,
    Session, SessionList, SessionSummary, TurnEvent,
};
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
        StoreError::NotEmpty => AppError::new(ErrorCode::SessionNotEmpty),
        StoreError::NotWaiting => AppError::new(ErrorCode::RequestNotWaiting),
        StoreError::NotTrusted => AppError::new(ErrorCode::ProjectNotTrusted),
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

/// The agent for a new session in a project (ADR 0039): the agent of that project's latest
/// session, else of the latest session anywhere, else Claude when Claude Code is installed, else
/// the Demo agent.
fn new_session_agent(
    sessions: &SessionStore,
    project_id: &str,
    claude_installed: bool,
) -> AgentKind {
    sessions
        .agent_for_new_session(project_id)
        .unwrap_or(if claude_installed {
            AgentKind::Claude
        } else {
            AgentKind::Demo
        })
}

/// The agent a new session in a project would have, the Playground when none is given (ADR 0039).
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn agent_for_new_session(
    project_id: Option<String>,
    sessions: State<'_, Sessions>,
    detections: State<'_, crate::agents::Detections>,
) -> Result<AgentKind, AppError> {
    Ok(new_session_agent(
        &sessions,
        project_id.as_deref().unwrap_or(PLAYGROUND_ID),
        detections.claude_installed(),
    ))
}

/// The model a new session in a project would take, the Playground when none is given (ADR 0041):
/// that of the session the agent rule follows. None for the agent's own setting.
///
/// # Errors
///
/// Never fails today; it returns a `Result` like every command.
// Every command returns a `Result` (ADR 0008).
#[allow(clippy::unnecessary_wraps)]
#[tauri::command]
#[specta::specta]
pub fn model_for_new_session(
    project_id: Option<String>,
    sessions: State<'_, Sessions>,
) -> Result<Option<Model>, AppError> {
    Ok(sessions.model_for_new_session(project_id.as_deref().unwrap_or(PLAYGROUND_ID)))
}

/// Changes the model a session works with, none for the agent's own setting (ADR 0041). It applies
/// from the next message.
///
/// # Errors
///
/// Returns an error when there is no such session, it is archived, a reply is running, or the
/// change cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn set_session_model(
    id: String,
    model: Option<Model>,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.set_model(&id, model).map_err(app_error)?;
    tracing::info!(session = %id, ?model, "the session's model changed");
    Ok(())
}

/// Starts an empty session in a project, the Playground when none is given, with the agent given,
/// or the one a new session there takes (ADR 0039).
///
/// # Errors
///
/// Returns an error when the project does not exist, or the session cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn create_session(
    agent: Option<AgentKind>,
    project_id: Option<String>,
    sessions: State<'_, Sessions>,
    detections: State<'_, crate::agents::Detections>,
) -> Result<SessionSummary, AppError> {
    let project = project_id.as_deref().unwrap_or(PLAYGROUND_ID);
    let agent = agent
        .unwrap_or_else(|| new_session_agent(&sessions, project, detections.claude_installed()));
    let session = sessions.create_session(project, agent).map_err(app_error)?;
    tracing::info!(session = %session.id, ?agent, "session created");
    Ok(session)
}

/// Changes the agent of a session that has had no message yet (ADR 0039).
///
/// # Errors
///
/// Returns an error when there is no such session, it is archived or has had a message, or the
/// change cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn set_session_agent(
    id: String,
    agent: AgentKind,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.set_agent(&id, agent).map_err(app_error)?;
    tracing::info!(session = %id, ?agent, "the session's agent changed");
    Ok(())
}

/// Moves a session that has had no message yet to another project (ADR 0039).
///
/// # Errors
///
/// Returns an error when there is no such session or project, the session is archived or has had a
/// message, or the change cannot be saved.
#[tauri::command]
#[specta::specta]
pub fn set_session_project(
    id: String,
    project_id: String,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions.set_project(&id, &project_id).map_err(app_error)?;
    tracing::info!(session = %id, project = %project_id, "the session's project changed");
    Ok(())
}

/// Asks the person for a folder with Windows' dialog, and adds it as a project (ADR 0039). Nothing
/// when they cancel. A folder opened before is the same project.
///
/// # Errors
///
/// Returns an error when the project cannot be saved.
#[tauri::command]
#[specta::specta]
pub async fn pick_folder(
    app: tauri::AppHandle,
    sessions: State<'_, Sessions>,
) -> Result<Option<Project>, AppError> {
    let Some(folder) = crate::commands::choose_folder(&app).await else {
        return Ok(None);
    };
    let project = sessions.open_folder(&folder).map_err(app_error)?;
    tracing::info!(project = %project.id, "a folder was opened as a project");
    Ok(Some(project))
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
    claude: State<'_, crate::agents::Claude>,
) -> Result<(), AppError> {
    sessions.set_archived(&id, archived).map_err(app_error)?;
    // An archived session needs no Claude Code until it is used again (ADR 0039).
    if archived {
        claude.0.end(&id);
    }
    Ok(())
}

/// Deletes a session for good, after the person confirmed it (ADR 0036). A reply that is still
/// running stops.
///
/// # Errors
///
/// Returns an error when there is no such session, or the file cannot be written.
#[tauri::command]
#[specta::specta]
pub fn delete_session(
    id: String,
    sessions: State<'_, Sessions>,
    claude: State<'_, crate::agents::Claude>,
) -> Result<(), AppError> {
    sessions.delete(&id).map_err(app_error)?;
    claude.0.end(&id);
    tracing::info!(session = %id, "session deleted");
    Ok(())
}

/// Remembers that the person trusts a project's folder, so Claude may work in it (ADR 0039).
///
/// # Errors
///
/// Returns an error when there is no such project, or the file cannot be written.
#[tauri::command]
#[specta::specta]
pub fn trust_project(project_id: String, sessions: State<'_, Sessions>) -> Result<(), AppError> {
    sessions.trust_project(&project_id).map_err(app_error)?;
    tracing::info!(project = %project_id, "project trusted");
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

/// Answers an approval request that waits in a session's running turn (ADR 0039).
///
/// # Errors
///
/// Returns an error when there is no such session, or no such request waits for an answer.
#[tauri::command]
#[specta::specta]
pub fn answer_approval(
    session_id: String,
    item_id: String,
    answer: Answer,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions
        .answer(&session_id, &item_id, answer)
        .map_err(app_error)
}

/// Hands the person's answers to questions that wait in a session's running turn (ADR 0039).
///
/// # Errors
///
/// Returns an error when there is no such session, or no such questions wait for answers.
#[tauri::command]
#[specta::specta]
pub fn answer_questions(
    session_id: String,
    item_id: String,
    answers: Vec<QuestionAnswer>,
    sessions: State<'_, Sessions>,
) -> Result<(), AppError> {
    sessions
        .answer_questions(&session_id, &item_id, answers)
        .map_err(app_error)
}

/// What a notification says when an agent waits for the person's answer, if the event is a
/// request or questions that start waiting.
fn waiting_notice(agent: AgentKind, event: &TurnEvent) -> Option<String> {
    let TurnEvent::ItemAdded { item, .. } = event else {
        return None;
    };
    let name = match agent {
        AgentKind::Claude => "Claude",
        AgentKind::Demo => "The Demo agent",
    };
    let action = match item {
        Item::Approval {
            state: ApprovalState::Waiting,
            action,
            ..
        } => action,
        Item::Questions {
            state: QuestionState::Waiting,
            ..
        } => return Some(format!("{name} asks you a question.")),
        _ => return None,
    };
    let what = match action {
        ApprovalAction::RunCommand => "run a command",
        ApprovalAction::EditFile => "edit a file",
        ApprovalAction::CreateFile => "create a file",
        ApprovalAction::OpenPage => "open a web page",
        ApprovalAction::SearchWeb => "search the web",
        ApprovalAction::UseTool => "use a tool",
    };
    Some(format!("{name} asks to {what}."))
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
    claude: State<'_, crate::agents::Claude>,
) -> Result<Session, AppError> {
    let turn = sessions.start_turn(&session_id, &text).map_err(app_error)?;
    // Taken before the reply starts, so the events that follow never overlap with it.
    let snapshot = sessions.session(&session_id).map_err(app_error)?;

    let store = Arc::clone(sessions.inner());
    let claude = Arc::clone(&claude.0);
    let agent = snapshot.agent;
    let running = turn.clone();
    thread::spawn(move || {
        let demo = DemoDriver::new();
        let driver: &dyn AgentDriver = match agent {
            AgentKind::Demo => &demo,
            AgentKind::Claude => claude.as_ref(),
        };
        let saved = store.stream_reply(driver, &session_id, &running, |event| {
            if let Some(body) = waiting_notice(agent, event) {
                crate::notifications::notify_when_away(&app, arden_core::APP_NAME, &body);
            }
            on_event.send(event.clone()).is_ok()
        });
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

/// Opens a folder as a project, starts a session in it with the agent a new session there takes
/// (ADR 0039), and asks the page to show it.
pub fn open_folder(app: &tauri::AppHandle, folder: &std::path::Path) {
    use tauri::Manager;
    use tauri_specta::Event;

    let store = app.state::<Sessions>();
    let session = store.open_folder(folder).and_then(|project| {
        let claude_installed = app.state::<crate::agents::Detections>().claude_installed();
        store.create_session(
            &project.id,
            new_session_agent(&store, &project.id, claude_installed),
        )
    });
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

    fn approval(state: ApprovalState) -> TurnEvent {
        TurnEvent::ItemAdded {
            turn_id: "t".to_owned(),
            item: Item::Approval {
                id: "t-approval-1".to_owned(),
                tool_call_id: None,
                action: ApprovalAction::RunCommand,
                subject: "npm test".to_owned(),
                detail: None,
                rule: None,
                state,
            },
        }
    }

    #[test]
    fn with_no_session_at_all_a_new_session_takes_claude_when_it_is_installed() {
        let store = SessionStore::new(vec![playground::describe(Path::new(r"C:Playground"))]);

        assert_eq!(
            new_session_agent(&store, PLAYGROUND_ID, true),
            AgentKind::Claude
        );
        assert_eq!(
            new_session_agent(&store, PLAYGROUND_ID, false),
            AgentKind::Demo
        );

        store
            .create_session(PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        assert_eq!(
            new_session_agent(&store, PLAYGROUND_ID, true),
            AgentKind::Demo,
            "the latest session's agent comes first"
        );
    }

    #[test]
    fn questions_that_start_waiting_are_worth_a_notification() {
        let asking = TurnEvent::ItemAdded {
            turn_id: "t".to_owned(),
            item: Item::Questions {
                id: "t-questions-1".to_owned(),
                tool_call_id: None,
                questions: Vec::new(),
                answers: Vec::new(),
                state: QuestionState::Waiting,
            },
        };

        assert_eq!(
            waiting_notice(AgentKind::Claude, &asking).as_deref(),
            Some("Claude asks you a question.")
        );
    }

    #[test]
    fn a_request_that_starts_waiting_is_worth_a_notification() {
        assert_eq!(
            waiting_notice(AgentKind::Claude, &approval(ApprovalState::Waiting)).as_deref(),
            Some("Claude asks to run a command.")
        );
        assert_eq!(
            waiting_notice(AgentKind::Claude, &approval(ApprovalState::Allowed)),
            None,
            "an answered request needs no one"
        );
        assert_eq!(
            waiting_notice(
                AgentKind::Claude,
                &TurnEvent::Finished {
                    turn_id: "t".to_owned()
                }
            ),
            None
        );
    }

    #[test]
    fn nothing_waits_for_the_page_when_the_person_starts_fresh() {
        let (store, _) = store_with_a_session_opened();

        assert_eq!(PendingOpen::at_start(OnStartup::Fresh, &store).take(), None);
    }
}
