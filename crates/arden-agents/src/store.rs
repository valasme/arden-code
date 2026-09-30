//! Projects and sessions, kept in memory (ADR 0016). They disappear when the app closes.

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
    sessions: Vec<Session>,
    last_id: u64,
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
    projects: Vec<Project>,
    inner: Mutex<Inner>,
}

impl SessionStore {
    /// A store with the given projects and no sessions.
    #[must_use]
    pub fn new(projects: Vec<Project>) -> Self {
        Self {
            projects,
            inner: Mutex::new(Inner::default()),
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
        self.projects
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
        if !self.projects.iter().any(|project| project.id == project_id) {
            return Err(StoreError::UnknownProject);
        }
        let mut inner = self.lock();
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
        let turn_id = match event {
            TurnEvent::TextDelta { turn_id, .. }
            | TurnEvent::Finished { turn_id }
            | TurnEvent::Failed { turn_id } => turn_id,
        };
        let Some(turn) = session.turns.iter_mut().find(|turn| turn.id == *turn_id) else {
            return;
        };
        match event {
            TurnEvent::TextDelta { item_id, text, .. } => {
                let existing = turn.items.iter_mut().find(|item| item.id() == item_id);
                match existing {
                    Some(Item::Text { text: whole, .. }) => whole.push_str(text),
                    None => turn.items.push(Item::Text {
                        id: item_id.clone(),
                        text: text.clone(),
                    }),
                }
            }
            TurnEvent::Finished { .. } => turn.status = TurnStatus::Done,
            TurnEvent::Failed { .. } => turn.status = TurnStatus::Failed,
        }
    }

    /// Has the driver answer a turn, recording each event and passing it to `on_event`. A false
    /// answer from `on_event` means nobody is listening any more, and stops the reply. A reply that
    /// is stopped this way is marked as failed, so the session is not left waiting for it.
    pub fn stream_reply(
        &self,
        driver: &dyn AgentDriver,
        session_id: &str,
        turn: &Turn,
        mut on_event: impl FnMut(&TurnEvent) -> bool,
    ) {
        let mut ended = false;
        driver.reply(&turn.id, &turn.prompt, &mut |event| {
            self.apply(session_id, &event);
            ended = matches!(event, TurnEvent::Finished { .. } | TurnEvent::Failed { .. });
            if on_event(&event) {
                Flow::Continue
            } else {
                Flow::Stop
            }
        });
        if !ended {
            self.apply(
                session_id,
                &TurnEvent::Failed {
                    turn_id: turn.id.clone(),
                },
            );
        }
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
        assert_eq!(reply.items.len(), 1);
        let Item::Text { text, .. } = &reply.items[0];
        assert!(text.starts_with("This is the Demo agent."));
        assert!(text.contains("You wrote: hello"));
        // What the listener heard, put together, is what was saved.
        let heard_text: String = heard
            .iter()
            .filter_map(|event| match event {
                TurnEvent::TextDelta { text, .. } => Some(text.as_str()),
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
