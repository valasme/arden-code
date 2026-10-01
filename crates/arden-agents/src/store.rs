//! Projects and sessions, kept in memory (ADR 0016). They disappear when the app closes.

use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};

use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::driver::{AgentDriver, Flow};
use crate::model::{
    AgentKind, Item, Project, ProjectListing, Session, SessionSummary, Turn, TurnEvent, TurnStatus,
};

/// How many characters of the first message become the session's title.
const TITLE_LENGTH: usize = 60;

/// Why the store could not do what it was asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreError {
    UnknownProject,
    UnknownSession,
    /// The session's agent is still replying to the last message.
    TurnRunning,
}

/// The current time in UTC, as `2026-09-30T14:05:09Z`. Times are stored this way and shown in
/// local time by the UI.
#[must_use]
pub fn now_utc() -> String {
    OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .ok()
        .and_then(|now| now.format(&Rfc3339).ok())
        .unwrap_or_default()
}

fn title_of(prompt: &str) -> Option<String> {
    let line = prompt.lines().find(|line| !line.trim().is_empty())?.trim();
    let mut characters = line.chars();
    let mut title: String = characters.by_ref().take(TITLE_LENGTH).collect();
    if characters.next().is_some() {
        title.push('…');
    }
    Some(title)
}

#[derive(Default)]
struct Inner {
    projects: Vec<Project>,
    sessions: Vec<Session>,
    last_id: u64,
    /// The turns whose reply the person has asked to stop, until their driver has noticed.
    stopping: HashSet<String>,
}

impl Inner {
    fn next_id(&mut self, kind: &str) -> String {
        self.last_id += 1;
        format!("{kind}-{}", self.last_id)
    }

    fn session_mut(&mut self, id: &str) -> Result<&mut Session, StoreError> {
        self.sessions
            .iter_mut()
            .find(|session| session.id == id)
            .ok_or(StoreError::UnknownSession)
    }
}

/// Every project and session the app knows.
pub struct SessionStore {
    inner: Mutex<Inner>,
}

impl SessionStore {
    /// A store with the given projects and no sessions.
    #[must_use]
    pub fn new(projects: Vec<Project>) -> Self {
        Self {
            inner: Mutex::new(Inner {
                projects,
                ..Inner::default()
            }),
        }
    }

    // A panic while the lock is held cannot leave the sessions half changed in a way that matters
    // more than losing the whole app to a poisoned lock.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The projects with their sessions, the newest session first.
    #[must_use]
    pub fn projects(&self) -> Vec<ProjectListing> {
        let inner = self.lock();
        inner
            .projects
            .iter()
            .map(|project| ProjectListing {
                project: project.clone(),
                sessions: inner
                    .sessions
                    .iter()
                    .rev()
                    .filter(|session| session.project_id == project.id)
                    .map(summary_of)
                    .collect(),
            })
            .collect()
    }

    /// Adds a folder as a project, and returns it. A folder that is a project already (the same
    /// path, whatever the case of its letters or a closing backslash) is returned as it is.
    pub fn open_folder(&self, folder: &std::path::Path) -> Project {
        let path = folder.display().to_string();
        let same = |other: &str| {
            let plain = |text: &str| text.trim_end_matches(['\\', '/']).to_lowercase();
            plain(other) == plain(&path)
        };
        let mut inner = self.lock();
        if let Some(known) = inner.projects.iter().find(|project| same(&project.path)) {
            return known.clone();
        }
        let name = folder
            .file_name()
            .map_or_else(|| path.clone(), |name| name.to_string_lossy().into_owned());
        let project = Project {
            id: inner.next_id("folder"),
            kind: crate::model::ProjectKind::Folder,
            name,
            path,
        };
        inner.projects.push(project.clone());
        project
    }

    /// Starts an empty session in a project.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownProject`] when there is no such project.
    pub fn create_session(
        &self,
        project_id: &str,
        agent: AgentKind,
    ) -> Result<SessionSummary, StoreError> {
        let mut inner = self.lock();
        if !inner
            .projects
            .iter()
            .any(|project| project.id == project_id)
        {
            return Err(StoreError::UnknownProject);
        }
        let session = Session {
            id: inner.next_id("session"),
            project_id: project_id.to_owned(),
            agent,
            title: None,
            created_at: now_utc(),
            turns: Vec::new(),
        };
        let summary = summary_of(&session);
        inner.sessions.push(session);
        Ok(summary)
    }

    /// A session with all of its turns.
    #[must_use]
    pub fn session(&self, id: &str) -> Option<Session> {
        self.lock()
            .sessions
            .iter()
            .find(|session| session.id == id)
            .cloned()
    }

    /// Adds the person's message to a session as a turn that is still running. The session takes
    /// its title from the first message.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::TurnRunning`] while the agent is still answering the last message.
    pub fn start_turn(&self, session_id: &str, prompt: &str) -> Result<Turn, StoreError> {
        let mut inner = self.lock();
        let turn_id = inner.next_id("turn");
        let session = inner.session_mut(session_id)?;
        if session
            .turns
            .iter()
            .any(|turn| turn.status == TurnStatus::Running)
        {
            return Err(StoreError::TurnRunning);
        }
        if session.title.is_none() {
            session.title = title_of(prompt);
        }
        let turn = Turn {
            id: turn_id,
            prompt: prompt.to_owned(),
            started_at: now_utc(),
            status: TurnStatus::Running,
            items: Vec::new(),
        };
        session.turns.push(turn.clone());
        Ok(turn)
    }

    /// Records an event of a reply. Events for a session or turn that is gone are ignored.
    pub fn apply(&self, session_id: &str, event: &TurnEvent) {
        let mut inner = self.lock();
        let Ok(session) = inner.session_mut(session_id) else {
            return;
        };
        if let Some(turn) = session
            .turns
            .iter_mut()
            .find(|turn| turn.id == event.turn_id())
        {
            turn.apply(event);
        }
    }

    /// Adds a turn that is already over, with the given reply. Tests use it to make long sessions.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session.
    pub fn add_finished_turn(
        &self,
        session_id: &str,
        prompt: &str,
        items: Vec<Item>,
    ) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let id = inner.next_id("turn");
        let session = inner.session_mut(session_id)?;
        if session.title.is_none() {
            session.title = title_of(prompt);
        }
        session.turns.push(Turn {
            id,
            prompt: prompt.to_owned(),
            started_at: now_utc(),
            status: TurnStatus::Done,
            items,
        });
        Ok(())
    }

    /// Asks for the reply that is running in a session to stop. The driver notices at its next
    /// event, and the turn then ends as stopped. Nothing happens when no reply is running.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session.
    pub fn stop_turn(&self, session_id: &str) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let running = inner
            .session_mut(session_id)?
            .turns
            .iter()
            .find(|turn| turn.status == TurnStatus::Running)
            .map(|turn| turn.id.clone());
        if let Some(turn_id) = running {
            inner.stopping.insert(turn_id);
        }
        Ok(())
    }

    fn is_stopping(&self, turn_id: &str) -> bool {
        self.lock().stopping.contains(turn_id)
    }

    /// Has the driver answer a turn, recording each event and passing it to `on_event`. A false
    /// answer from `on_event` means nobody is listening any more, and stops the reply; the turn is
    /// then marked as failed, so the session is not left waiting for it. A reply that the person
    /// stopped ends as stopped, and `on_event` is told.
    pub fn stream_reply(
        &self,
        driver: &dyn AgentDriver,
        session_id: &str,
        turn: &Turn,
        mut on_event: impl FnMut(&TurnEvent) -> bool,
    ) {
        let mut ended = false;
        driver.reply(&turn.id, &turn.prompt, &mut |event| {
            if self.is_stopping(&turn.id) {
                return Flow::Stop;
            }
            self.apply(session_id, &event);
            ended = matches!(event, TurnEvent::Finished { .. } | TurnEvent::Failed { .. });
            if on_event(&event) {
                Flow::Continue
            } else {
                Flow::Stop
            }
        });
        if !ended {
            let stopped = self.is_stopping(&turn.id);
            let event = if stopped {
                TurnEvent::Stopped {
                    turn_id: turn.id.clone(),
                }
            } else {
                TurnEvent::Failed {
                    turn_id: turn.id.clone(),
                }
            };
            self.apply(session_id, &event);
            if stopped {
                on_event(&event);
            }
        }
        self.lock().stopping.remove(&turn.id);
    }
}

fn summary_of(session: &Session) -> SessionSummary {
    SessionSummary {
        id: session.id.clone(),
        project_id: session.project_id.clone(),
        agent: session.agent,
        title: session.title.clone(),
        created_at: session.created_at.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::demo::DemoDriver;
    use crate::model::Item;
    use crate::playground;

    fn store() -> SessionStore {
        SessionStore::new(vec![playground::describe(Path::new(r"C:\Playground"))])
    }

    #[test]
    fn lists_the_playground_with_no_sessions_at_first() {
        let listing = store().projects();

        assert_eq!(listing.len(), 1);
        assert_eq!(listing[0].project.id, playground::PLAYGROUND_ID);
        assert!(listing[0].sessions.is_empty());
    }

    #[test]
    fn an_opened_folder_becomes_a_project_named_after_it_and_can_have_sessions() {
        let store = store();

        let project = store.open_folder(Path::new(r"C:\Work\my-app"));
        let session = store
            .create_session(&project.id, AgentKind::Demo)
            .expect("a session");

        assert_eq!(project.name, "my-app");
        assert_eq!(project.path, r"C:\Work\my-app");
        assert_eq!(project.kind, crate::model::ProjectKind::Folder);
        let listing = store.projects();
        assert_eq!(listing.len(), 2, "the Playground and the folder");
        assert_eq!(listing[1].project, project);
        assert_eq!(listing[1].sessions[0].id, session.id);
    }

    #[test]
    fn opening_the_same_folder_again_gives_the_same_project_whatever_its_spelling() {
        let store = store();

        let first = store.open_folder(Path::new(r"C:\Work\my-app"));
        let again = store.open_folder(Path::new(r"c:\work\MY-APP\"));

        assert_eq!(again, first);
        assert_eq!(store.projects().len(), 2);
    }

    #[test]
    fn a_drive_root_is_named_by_its_path() {
        let project = store().open_folder(Path::new(r"D:\"));

        assert_eq!(project.name, r"D:\");
    }

    #[test]
    fn new_sessions_are_listed_newest_first() {
        let store = store();
        let first = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let second = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        let ids: Vec<String> = store.projects()[0]
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect();

        assert_eq!(ids, vec![second.id, first.id]);
    }

    #[test]
    fn a_session_needs_a_project_that_exists() {
        assert_eq!(
            store().create_session("nowhere", AgentKind::Demo),
            Err(StoreError::UnknownProject)
        );
    }

    #[test]
    fn times_are_utc_and_in_the_rfc_3339_form() {
        let session = store()
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        // 2026-09-30T14:05:09Z
        assert_eq!(session.created_at.len(), 20, "{}", session.created_at);
        assert!(session.created_at.ends_with('Z'), "{}", session.created_at);
        assert!(OffsetDateTime::parse(&session.created_at, &Rfc3339).is_ok());
    }

    #[test]
    fn the_first_message_becomes_the_title_and_the_second_does_not_change_it() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        let turn = store
            .start_turn(&session.id, "  Fix the build\nplease ")
            .expect("a turn");
        store.apply(&session.id, &TurnEvent::Finished { turn_id: turn.id });
        store
            .start_turn(&session.id, "Another thing")
            .expect("a turn");

        assert_eq!(
            store
                .session(&session.id)
                .expect("the session")
                .title
                .as_deref(),
            Some("Fix the build")
        );
        assert_eq!(
            store.projects()[0].sessions[0].title.as_deref(),
            Some("Fix the build")
        );
    }

    #[test]
    fn a_long_first_message_is_cut_with_an_ellipsis() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        store
            .start_turn(&session.id, &"a".repeat(200))
            .expect("a turn");

        let title = store
            .session(&session.id)
            .expect("the session")
            .title
            .expect("a title");
        assert_eq!(title.chars().count(), TITLE_LENGTH + 1);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn a_second_message_waits_for_the_reply_to_the_first() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        store.start_turn(&session.id, "one").expect("a turn");

        assert_eq!(
            store.start_turn(&session.id, "two"),
            Err(StoreError::TurnRunning)
        );
    }

    #[test]
    fn a_message_needs_a_session_that_exists() {
        assert_eq!(
            store().start_turn("session-99", "hi"),
            Err(StoreError::UnknownSession)
        );
    }

    #[test]
    fn a_streamed_reply_ends_up_whole_in_the_session_and_reaches_the_listener() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hello").expect("a turn");

        let mut heard = Vec::new();
        store.stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
            heard.push(event.clone());
            true
        });

        let saved = store.session(&session.id).expect("the session");
        let reply = &saved.turns[0];
        assert_eq!(reply.status, TurnStatus::Done);
        let Some(Item::Text { text, .. }) = reply
            .items
            .iter()
            .find(|item| matches!(item, Item::Text { .. }))
        else {
            panic!("the reply has text");
        };
        assert!(text.starts_with("This is the **Demo agent**."));
        assert!(text.contains("> hello"));
        // What the listener heard of the text, put together, is what was saved.
        let heard_text: String = heard
            .iter()
            .filter_map(|event| match event {
                TurnEvent::TextDelta { item_id, text, .. } if item_id.ends_with("-text") => {
                    Some(text.as_str())
                }
                _ => None,
            })
            .collect();
        assert_eq!(&heard_text, text);
    }

    #[test]
    fn a_reply_nobody_listens_to_is_marked_failed_and_frees_the_session() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hello").expect("a turn");

        store.stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| false);

        let saved = store.session(&session.id).expect("the session");
        assert_eq!(saved.turns[0].status, TurnStatus::Failed);
        assert!(store.start_turn(&session.id, "again").is_ok());
    }

    #[test]
    fn a_reply_the_person_stops_ends_as_stopped_and_says_so_to_the_listener() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hello").expect("a turn");

        let mut heard = Vec::new();
        store.stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
            heard.push(event.clone());
            // The person presses Esc while the first tool is running.
            if matches!(
                event,
                TurnEvent::ItemAdded {
                    item: Item::ToolCall { .. },
                    ..
                }
            ) {
                store.stop_turn(&session.id).expect("the session exists");
            }
            true
        });

        let saved = store.session(&session.id).expect("the session");
        let reply = &saved.turns[0];
        assert_eq!(reply.status, TurnStatus::Stopped);
        assert!(matches!(heard.last(), Some(TurnEvent::Stopped { .. })));
        assert!(
            reply.items.iter().any(|item| matches!(
                item,
                Item::ToolCall {
                    status: crate::model::ToolStatus::Stopped,
                    ..
                }
            )),
            "the tool that was running stopped with the reply"
        );
        assert!(matches!(
            reply.items.last(),
            Some(Item::Status {
                kind: crate::model::StatusKind::Stopped,
                ..
            })
        ));
        assert!(
            !reply
                .items
                .iter()
                .any(|item| matches!(item, Item::Text { .. })),
            "nothing is said after the stop"
        );
        assert!(
            store.start_turn(&session.id, "again").is_ok(),
            "the session is free again"
        );
    }

    #[test]
    fn stopping_when_no_reply_is_running_does_nothing_and_stopping_a_missing_session_is_an_error() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        assert_eq!(store.stop_turn(&session.id), Ok(()));
        assert_eq!(
            store.stop_turn("session-99"),
            Err(StoreError::UnknownSession)
        );
        // A reply that starts afterwards is not affected by the earlier request.
        let turn = store.start_turn(&session.id, "hi").expect("a turn");
        store.stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| true);
        assert_eq!(
            store.session(&session.id).expect("the session").turns[0].status,
            TurnStatus::Done
        );
    }

    #[test]
    fn events_for_things_that_are_gone_are_ignored() {
        let store = store();

        store.apply(
            "session-99",
            &TurnEvent::Finished {
                turn_id: "turn-1".into(),
            },
        );
    }
}
