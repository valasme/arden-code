//! Projects and sessions (ADR 0016), kept in a file between starts (ADR 0035). The store holds them
//! in memory while the app runs, and writes each change to the file.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::database::{Database, DatabaseError, Order};
use crate::driver::{AgentDriver, Flow};
use crate::model::{
    AgentKind, Item, Project, ProjectKind, ProjectListing, Session, SessionList, SessionSummary,
    Turn, TurnEvent, TurnStatus,
};

/// How many characters of the first message become the session's title.
const TITLE_LENGTH: usize = 60;

/// The most characters a name given to a session can have.
pub const NAME_LENGTH: usize = 100;

/// Why the store could not do what it was asked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    UnknownProject,
    UnknownSession,
    /// The session's agent is still replying to the last message.
    TurnRunning,
    /// A name for a session is empty, or longer than [`NAME_LENGTH`].
    InvalidName,
    /// The session is archived: it takes no message, name or pin until it is unarchived.
    Archived,
    /// The change could not be written to the file, so it was not made. Says why, for the logs.
    NotSaved(String),
    /// What the file holds could not be read. Says why, for the logs.
    NotRead(String),
}

fn not_saved(error: DatabaseError) -> StoreError {
    StoreError::NotSaved(error.0)
}

/// What went wrong with the file when the store was opened. The store works either way.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenProblem {
    /// The file could not be read. It was kept under another name, and the store started empty.
    SetAside { kept_as: PathBuf, reason: String },
    /// The file could not be opened or written, so the sessions are kept in memory until the app
    /// closes.
    NotSaving { reason: String },
}

/// A store just opened, and what went wrong with its file, if anything.
pub struct Opened {
    pub store: SessionStore,
    pub problem: Option<OpenProblem>,
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

/// A session as the store holds it.
struct Entry {
    session: Session,
    /// Whether `session.turns` holds its turns: they are read from the file when it is first opened.
    loaded: bool,
    /// Where it stands in the lists.
    order: Order,
}

impl Entry {
    /// The session without its turns: what the file keeps of it, apart from them. The turns are not
    /// copied, however many there are.
    fn header(&self) -> Session {
        let session = &self.session;
        Session {
            id: session.id.clone(),
            project_id: session.project_id.clone(),
            agent: session.agent,
            title: session.title.clone(),
            created_at: session.created_at.clone(),
            updated_at: session.updated_at.clone(),
            pinned: session.pinned,
            archived_at: session.archived_at.clone(),
            turns: Vec::new(),
        }
    }

    fn summary(&self) -> SessionSummary {
        let session = &self.session;
        SessionSummary {
            id: session.id.clone(),
            project_id: session.project_id.clone(),
            agent: session.agent,
            title: session.title.clone(),
            created_at: session.created_at.clone(),
            updated_at: session.updated_at.clone(),
            pinned: session.pinned,
            archived_at: session.archived_at.clone(),
        }
    }

    /// Reads its turns from the file, the first time they are needed.
    fn load(&mut self, database: &Database) -> Result<(), StoreError> {
        if !self.loaded {
            self.session.turns = database
                .turns(&self.session.id)
                .map_err(|error| StoreError::NotRead(error.0))?;
            self.loaded = true;
        }
        Ok(())
    }
}

fn find<'a>(sessions: &'a mut [Entry], id: &str) -> Result<&'a mut Entry, StoreError> {
    sessions
        .iter_mut()
        .find(|entry| entry.session.id == id)
        .ok_or(StoreError::UnknownSession)
}

struct Inner {
    projects: Vec<Project>,
    sessions: Vec<Entry>,
    /// The last number given to an id or an order. Kept in the file, so no number is used twice.
    last_id: u64,
    /// The turns whose reply the person has asked to stop, until their driver has noticed.
    stopping: HashSet<String>,
    /// The session that was opened last, to open again at the next start.
    last_open: Option<String>,
    database: Database,
}

impl Inner {
    fn next_number(&mut self) -> u64 {
        self.last_id += 1;
        self.last_id
    }

    fn next_id(&mut self, kind: &str) -> String {
        format!("{kind}-{}", self.next_number())
    }
}

/// Moves a file that cannot be read out of the way, with the files SQLite keeps beside it, and keeps
/// it for the person. Answers where it went.
fn set_aside(file: &Path, now: OffsetDateTime) -> std::io::Result<PathBuf> {
    let stamp = format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    );
    let folder = file.parent().unwrap_or_else(|| Path::new("."));
    let mut target = folder.join(format!("sessions.invalid-{stamp}.db"));
    let mut attempt = 2;
    while target.exists() {
        target = folder.join(format!("sessions.invalid-{stamp}-{attempt}.db"));
        attempt += 1;
    }
    std::fs::rename(file, &target)?;
    for companion in ["-wal", "-shm"] {
        let mut from = file.as_os_str().to_owned();
        from.push(companion);
        let mut to = target.as_os_str().to_owned();
        to.push(companion);
        if Path::new(&from).exists() {
            std::fs::rename(&from, &to)?;
        }
    }
    Ok(target)
}

/// Every project and session the app knows.
pub struct SessionStore {
    inner: Mutex<Inner>,
}

impl SessionStore {
    /// A store with the given projects and no sessions, kept in memory only: nothing is saved.
    ///
    /// # Panics
    ///
    /// When SQLite cannot keep a database in memory, which only happens when memory runs out.
    #[must_use]
    pub fn new(projects: Vec<Project>) -> Self {
        let mut database = Database::in_memory();
        for (position, project) in projects.iter().enumerate() {
            database
                .save_project(project, position, 0)
                .expect("a database in memory takes a project");
        }
        Self::with(database, projects, Vec::new(), 0, None)
    }

    fn with(
        database: Database,
        projects: Vec<Project>,
        sessions: Vec<Entry>,
        last_id: u64,
        last_open: Option<String>,
    ) -> Self {
        Self {
            inner: Mutex::new(Inner {
                projects,
                sessions,
                last_id,
                stopping: HashSet::new(),
                last_open,
                database,
            }),
        }
    }

    /// Opens the store kept in `file`, which is made when it is not there. The Playground is the
    /// built-in project, as it is described on this start. It never fails: a file that cannot be
    /// read is set aside and the store starts empty, and a file that cannot be opened at all leaves
    /// the store in memory.
    #[must_use]
    pub fn open(file: &Path, playground: &Project) -> Opened {
        Self::open_at(file, playground, OffsetDateTime::now_utc())
    }

    /// [`Self::open`] with the time given, so that tests can predict the name of a file set aside.
    #[must_use]
    pub fn open_at(file: &Path, playground: &Project, now: OffsetDateTime) -> Opened {
        let reason = match Self::read(file, playground) {
            Ok(store) => {
                return Opened {
                    store,
                    problem: None,
                };
            }
            Err(error) => error.0,
        };
        let in_memory = |reason: String| Opened {
            store: Self::new(vec![playground.clone()]),
            problem: Some(OpenProblem::NotSaving { reason }),
        };
        if !file.is_file() {
            return in_memory(reason);
        }
        let kept_as = match set_aside(file, now) {
            Ok(kept_as) => kept_as,
            Err(error) => {
                return in_memory(format!("{reason}; it could not be set aside: {error}"));
            }
        };
        match Self::read(file, playground) {
            Ok(store) => Opened {
                store,
                problem: Some(OpenProblem::SetAside { kept_as, reason }),
            },
            Err(error) => in_memory(error.0),
        }
    }

    fn read(file: &Path, playground: &Project) -> Result<Self, DatabaseError> {
        let mut database = Database::open(file)?;
        let saved = database.load(playground)?;
        let mut projects = saved.projects;
        // The Playground is listed first, as it is described on this start.
        projects.retain(|project| project.id != playground.id);
        projects.insert(0, playground.clone());
        let sessions = saved
            .sessions
            .into_iter()
            .map(|saved| Entry {
                session: saved.session,
                loaded: false,
                order: saved.order,
            })
            .collect();
        Ok(Self::with(
            database,
            projects,
            sessions,
            saved.last_id,
            saved.last_open,
        ))
    }

    // A panic while the lock is held cannot leave the sessions half changed in a way that matters
    // more than losing the whole app to a poisoned lock.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The sessions as the sidebar lists them: the pinned ones in the order they were pinned, then
    /// the projects, each with its other sessions, the most recently used first, and the archived
    /// ones apart, the last archived first.
    #[must_use]
    pub fn list(&self) -> SessionList {
        let inner = self.lock();
        let mut archived: Vec<&Entry> = inner
            .sessions
            .iter()
            .filter(|entry| entry.order.archived.is_some())
            .collect();
        archived.sort_by_key(|entry| std::cmp::Reverse(entry.order.archived));
        let mut pinned: Vec<&Entry> = inner
            .sessions
            .iter()
            .filter(|entry| entry.order.pinned.is_some())
            .collect();
        pinned.sort_by_key(|entry| entry.order.pinned);
        let mut sessions: Vec<&Entry> = inner
            .sessions
            .iter()
            .filter(|entry| entry.order.pinned.is_none() && entry.order.archived.is_none())
            .collect();
        sessions.sort_by_key(|entry| std::cmp::Reverse(entry.order.used));
        SessionList {
            archived: archived.iter().map(|entry| entry.summary()).collect(),
            pinned: pinned.iter().map(|entry| entry.summary()).collect(),
            projects: inner
                .projects
                .iter()
                .map(|project| ProjectListing {
                    project: project.clone(),
                    sessions: sessions
                        .iter()
                        .filter(|entry| entry.session.project_id == project.id)
                        .map(|entry| entry.summary())
                        .collect(),
                })
                .collect(),
        }
    }

    /// Adds a folder as a project, and returns it. A folder that is a project already (the same
    /// path, whatever the case of its letters or a closing backslash) is returned as it is.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::NotSaved`] when the project cannot be written.
    pub fn open_folder(&self, folder: &Path) -> Result<Project, StoreError> {
        let path = folder.display().to_string();
        let same = |other: &str| {
            let plain = |text: &str| text.trim_end_matches(['\\', '/']).to_lowercase();
            plain(other) == plain(&path)
        };
        let mut inner = self.lock();
        if let Some(known) = inner.projects.iter().find(|project| same(&project.path)) {
            return Ok(known.clone());
        }
        let name = folder
            .file_name()
            .map_or_else(|| path.clone(), |name| name.to_string_lossy().into_owned());
        let project = Project {
            id: inner.next_id("folder"),
            kind: ProjectKind::Folder,
            name,
            path,
        };
        let (position, last_id) = (inner.projects.len(), inner.last_id);
        inner
            .database
            .save_project(&project, position, last_id)
            .map_err(not_saved)?;
        inner.projects.push(project.clone());
        Ok(project)
    }

    /// Remembers that a session was opened, so that it can be opened again at the next start.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::NotSaved`] when it cannot be written.
    pub fn remember_open(&self, session_id: &str) -> Result<(), StoreError> {
        let mut inner = self.lock();
        find(&mut inner.sessions, session_id)?;
        let last_id = inner.last_id;
        inner
            .database
            .save_last_open(session_id, last_id)
            .map_err(not_saved)?;
        inner.last_open = Some(session_id.to_owned());
        Ok(())
    }

    /// The session that was opened last, if it is still there and not archived.
    #[must_use]
    pub fn last_open(&self) -> Option<String> {
        let inner = self.lock();
        inner.last_open.clone().filter(|id| {
            inner
                .sessions
                .iter()
                .any(|entry| &entry.session.id == id && entry.order.archived.is_none())
        })
    }

    /// Gives a session a name, trimmed of spaces at either end. A session that has a name keeps it
    /// when its first message is sent.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::InvalidName`] when the name is empty or longer than [`NAME_LENGTH`],
    /// [`StoreError::UnknownSession`] when there is no such session, and [`StoreError::NotSaved`]
    /// when the name cannot be written.
    pub fn rename(&self, session_id: &str, name: &str) -> Result<(), StoreError> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > NAME_LENGTH {
            return Err(StoreError::InvalidName);
        }
        let mut inner = self.lock();
        let last_id = inner.last_id;
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let entry = find(sessions, session_id)?;
        if entry.session.archived_at.is_some() {
            return Err(StoreError::Archived);
        }
        let mut header = entry.header();
        header.title = Some(name.to_owned());
        database
            .save_session(&header, entry.order, last_id)
            .map_err(not_saved)?;
        entry.session.title = header.title;
        Ok(())
    }

    /// Pins a session to the top of the sidebar, or unpins it (ADR 0036). Pinned sessions are
    /// listed in the order they were pinned; pinning a pinned session leaves it where it is.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session,
    /// [`StoreError::Archived`] when it is archived, and [`StoreError::NotSaved`] when the change
    /// cannot be written.
    pub fn set_pinned(&self, session_id: &str, pinned: bool) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let entry = find(&mut inner.sessions, session_id)?;
        if pinned && entry.order.archived.is_some() {
            return Err(StoreError::Archived);
        }
        let known = entry.order.pinned;
        let pin = match (pinned, known) {
            (true, Some(place)) => Some(place),
            (true, None) => Some(inner.next_number()),
            (false, _) => None,
        };
        let last_id = inner.last_id;
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let entry = find(sessions, session_id)?;
        let mut header = entry.header();
        header.pinned = pin.is_some();
        let order = Order {
            pinned: pin,
            ..entry.order
        };
        database
            .save_session(&header, order, last_id)
            .map_err(not_saved)?;
        entry.session.pinned = header.pinned;
        entry.order = order;
        Ok(())
    }

    /// Archives a session, or unarchives it (ADR 0036). An archived session leaves the sidebar's
    /// lists for the archived ones, is no longer pinned, and takes no message, name or pin until it
    /// is unarchived; a reply that is still running stops at its driver's next event. Archiving an
    /// archived session leaves it where it is, with its date.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::NotSaved`] when the change cannot be written.
    pub fn set_archived(&self, session_id: &str, archived: bool) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let known = find(&mut inner.sessions, session_id)?.order.archived;
        let place = match (archived, known) {
            (true, Some(place)) => Some(place),
            (true, None) => Some(inner.next_number()),
            (false, _) => None,
        };
        let last_id = inner.last_id;
        let Inner {
            sessions,
            database,
            stopping,
            ..
        } = &mut *inner;
        let entry = find(sessions, session_id)?;
        let mut header = entry.header();
        if archived {
            header.pinned = false;
            if known.is_none() {
                header.archived_at = Some(now_utc());
            }
        } else {
            header.archived_at = None;
        }
        let order = Order {
            pinned: if archived { None } else { entry.order.pinned },
            archived: place,
            ..entry.order
        };
        database
            .save_session(&header, order, last_id)
            .map_err(not_saved)?;
        entry.session.pinned = header.pinned;
        entry.session.archived_at = header.archived_at;
        entry.order = order;
        if archived {
            for turn in &entry.session.turns {
                if turn.status == TurnStatus::Running {
                    stopping.insert(turn.id.clone());
                }
            }
        }
        Ok(())
    }

    /// Deletes a session for good (ADR 0036): from the list, and from the file, where its text is
    /// overwritten. A reply that is still running stops at its driver's next event.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::NotSaved`] when the file cannot be written, in which case nothing is deleted.
    pub fn delete(&self, session_id: &str) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let position = inner
            .sessions
            .iter()
            .position(|entry| entry.session.id == session_id)
            .ok_or(StoreError::UnknownSession)?;
        let forget = inner.last_open.as_deref() == Some(session_id);
        let last_id = inner.last_id;
        inner
            .database
            .delete_session(session_id, forget, last_id)
            .map_err(not_saved)?;
        let entry = inner.sessions.remove(position);
        for turn in &entry.session.turns {
            if turn.status == TurnStatus::Running {
                inner.stopping.insert(turn.id.clone());
            }
        }
        if forget {
            inner.last_open = None;
        }
        Ok(())
    }

    /// Starts an empty session in a project.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownProject`] when there is no such project, and
    /// [`StoreError::NotSaved`] when the session cannot be written.
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
        let now = now_utc();
        let entry = Entry {
            session: Session {
                id: inner.next_id("session"),
                project_id: project_id.to_owned(),
                agent,
                title: None,
                created_at: now.clone(),
                updated_at: now,
                pinned: false,
                archived_at: None,
                turns: Vec::new(),
            },
            loaded: true,
            order: Order {
                used: inner.next_number(),
                pinned: None,
                archived: None,
            },
        };
        let last_id = inner.last_id;
        inner
            .database
            .save_session(&entry.session, entry.order, last_id)
            .map_err(not_saved)?;
        let summary = entry.summary();
        inner.sessions.push(entry);
        Ok(summary)
    }

    /// A session with all of its turns.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::NotRead`] when its turns cannot be read from the file.
    pub fn session(&self, id: &str) -> Result<Session, StoreError> {
        let mut inner = self.lock();
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let entry = find(sessions, id)?;
        entry.load(database)?;
        Ok(entry.session.clone())
    }

    /// Adds the person's message to a session as a turn that is still running. The session takes
    /// its title from the first message, unless it has one, and becomes the most recently used.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session,
    /// [`StoreError::TurnRunning`] while the agent is still answering the last message, and
    /// [`StoreError::NotSaved`] when the message cannot be written.
    pub fn start_turn(&self, session_id: &str, prompt: &str) -> Result<Turn, StoreError> {
        let mut inner = self.lock();
        let turn_id = inner.next_id("turn");
        let used = inner.next_number();
        let last_id = inner.last_id;
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let entry = find(sessions, session_id)?;
        entry.load(database)?;
        if entry.session.archived_at.is_some() {
            return Err(StoreError::Archived);
        }
        if entry
            .session
            .turns
            .iter()
            .any(|turn| turn.status == TurnStatus::Running)
        {
            return Err(StoreError::TurnRunning);
        }
        let now = now_utc();
        let turn = Turn {
            id: turn_id,
            prompt: prompt.to_owned(),
            started_at: now.clone(),
            status: TurnStatus::Running,
            items: Vec::new(),
        };
        let mut header = entry.header();
        if header.title.is_none() {
            header.title = title_of(prompt);
        }
        header.updated_at = now;
        let position = entry.session.turns.len();
        database
            .save_session_and_turns(
                &header,
                Order {
                    used,
                    ..entry.order
                },
                &[(position, &turn)],
                last_id,
            )
            .map_err(not_saved)?;
        entry.session.title = header.title;
        entry.session.updated_at = header.updated_at;
        entry.order.used = used;
        entry.session.turns.push(turn.clone());
        Ok(turn)
    }

    /// Records an event of a reply. Events for a session or turn that is gone are ignored. The turn
    /// is written when its reply ends.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::NotSaved`] when the turn that ended cannot be written. The event is
    /// recorded in memory all the same.
    pub fn apply(&self, session_id: &str, event: &TurnEvent) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let last_id = inner.last_id;
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let Ok(entry) = find(sessions, session_id) else {
            return Ok(());
        };
        let Some(position) = entry
            .session
            .turns
            .iter()
            .position(|turn| turn.id == event.turn_id())
        else {
            return Ok(());
        };
        let turn = &mut entry.session.turns[position];
        turn.apply(event);
        if turn.status == TurnStatus::Running {
            return Ok(());
        }
        database
            .save_turn(session_id, position, turn, last_id)
            .map_err(not_saved)
    }

    /// Adds turns that are already over, each a message with its reply, in one write. The debug
    /// tools use it to make long sessions.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::UnknownSession`] when there is no such session, and
    /// [`StoreError::NotSaved`] when the turns cannot be written.
    pub fn add_finished_turns(
        &self,
        session_id: &str,
        replies: Vec<(String, Vec<Item>)>,
    ) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let now = now_utc();
        let mut turns = Vec::with_capacity(replies.len());
        for (prompt, items) in replies {
            turns.push(Turn {
                id: inner.next_id("turn"),
                prompt,
                started_at: now.clone(),
                status: TurnStatus::Done,
                items,
            });
        }
        let used = inner.next_number();
        let last_id = inner.last_id;
        let Inner {
            sessions, database, ..
        } = &mut *inner;
        let entry = find(sessions, session_id)?;
        entry.load(database)?;
        let mut header = entry.header();
        if header.title.is_none() {
            header.title = turns.first().and_then(|turn| title_of(&turn.prompt));
        }
        header.updated_at = now;
        let first = entry.session.turns.len();
        let placed: Vec<(usize, &Turn)> = turns
            .iter()
            .enumerate()
            .map(|(offset, turn)| (first + offset, turn))
            .collect();
        database
            .save_session_and_turns(
                &header,
                Order {
                    used,
                    ..entry.order
                },
                &placed,
                last_id,
            )
            .map_err(not_saved)?;
        entry.session.title = header.title;
        entry.session.updated_at = header.updated_at;
        entry.order.used = used;
        entry.session.turns.extend(turns);
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
        let running = find(&mut inner.sessions, session_id)?
            .session
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
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::NotSaved`] when the turn could not be written when it ended. The reply
    /// still reached `on_event`, and the session holds it until the app closes.
    pub fn stream_reply(
        &self,
        driver: &dyn AgentDriver,
        session_id: &str,
        turn: &Turn,
        mut on_event: impl FnMut(&TurnEvent) -> bool,
    ) -> Result<(), StoreError> {
        let mut ended = false;
        let mut saved = Ok(());
        driver.reply(&turn.id, &turn.prompt, &mut |event| {
            if self.is_stopping(&turn.id) {
                return Flow::Stop;
            }
            let applied = self.apply(session_id, &event);
            if saved.is_ok() {
                saved = applied;
            }
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
            let applied = self.apply(session_id, &event);
            if saved.is_ok() {
                saved = applied;
            }
            if stopped {
                on_event(&event);
            }
        }
        self.lock().stopping.remove(&turn.id);
        saved
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
        let listing = store().list().projects;

        assert_eq!(listing.len(), 1);
        assert_eq!(listing[0].project.id, playground::PLAYGROUND_ID);
        assert!(listing[0].sessions.is_empty());
    }

    #[test]
    fn an_opened_folder_becomes_a_project_named_after_it_and_can_have_sessions() {
        let store = store();

        let project = store
            .open_folder(Path::new(r"C:\Work\my-app"))
            .expect("a project");
        let session = store
            .create_session(&project.id, AgentKind::Demo)
            .expect("a session");

        assert_eq!(project.name, "my-app");
        assert_eq!(project.path, r"C:\Work\my-app");
        assert_eq!(project.kind, crate::model::ProjectKind::Folder);
        let listing = store.list().projects;
        assert_eq!(listing.len(), 2, "the Playground and the folder");
        assert_eq!(listing[1].project, project);
        assert_eq!(listing[1].sessions[0].id, session.id);
    }

    #[test]
    fn opening_the_same_folder_again_gives_the_same_project_whatever_its_spelling() {
        let store = store();

        let first = store
            .open_folder(Path::new(r"C:\Work\my-app"))
            .expect("a project");
        let again = store
            .open_folder(Path::new(r"c:\work\MY-APP\"))
            .expect("the same project");

        assert_eq!(again, first);
        assert_eq!(store.list().projects.len(), 2);
    }

    #[test]
    fn a_drive_root_is_named_by_its_path() {
        let project = store().open_folder(Path::new(r"D:\")).expect("a project");

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

        let ids: Vec<String> = store.list().projects[0]
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
        store
            .apply(&session.id, &TurnEvent::Finished { turn_id: turn.id })
            .expect("saved");
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
            store.list().projects[0].sessions[0].title.as_deref(),
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
        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
                heard.push(event.clone());
                true
            })
            .expect("saved");

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

        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| false)
            .expect("saved");

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
        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
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
            })
            .expect("saved");

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
        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| true)
            .expect("saved");
        assert_eq!(
            store.session(&session.id).expect("the session").turns[0].status,
            TurnStatus::Done
        );
    }

    /// A store kept in `file`, as the app keeps one in its data folder.
    fn store_in(file: &Path) -> SessionStore {
        let opened = SessionStore::open(file, &playground::describe(Path::new(r"C:\Playground")));
        assert!(opened.problem.is_none(), "{:?}", opened.problem);
        opened.store
    }

    #[test]
    fn a_session_and_its_reply_are_there_when_the_store_is_opened_again() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let id = {
            let store = store_in(&file);
            let session = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            let turn = store
                .start_turn(&session.id, "Remember me")
                .expect("a turn");
            store
                .stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| true)
                .expect("the reply is saved");
            session.id
        };

        let store = store_in(&file);

        let listed = &store.list().projects[0].sessions;
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, id);
        assert_eq!(listed[0].title.as_deref(), Some("Remember me"));
        let session = store.session(&id).expect("the session");
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].prompt, "Remember me");
        assert_eq!(session.turns[0].status, TurnStatus::Done);
        assert!(
            session.turns[0].items.iter().any(
                |item| matches!(item, Item::Text { text, .. } if text.contains("> Remember me"))
            )
        );
    }

    #[test]
    fn a_reply_cut_off_by_closing_the_app_comes_back_as_failed() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let id = {
            let store = store_in(&file);
            let session = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            store
                .start_turn(&session.id, "Never answered")
                .expect("a turn");
            session.id
        };

        let store = store_in(&file);

        let session = store.session(&id).expect("the session");
        assert_eq!(session.turns[0].prompt, "Never answered");
        assert_eq!(session.turns[0].status, TurnStatus::Failed);
        assert!(
            store.start_turn(&id, "Again").is_ok(),
            "the session is free for the next message"
        );
    }

    #[test]
    fn ids_go_on_from_where_they_were_so_none_is_used_twice() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let mut earlier = Vec::new();
        {
            let store = store_in(&file);
            for _ in 0..3 {
                let session = store
                    .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                    .expect("a session");
                let turn = store.start_turn(&session.id, "hi").expect("a turn");
                earlier.push(session.id);
                earlier.push(turn.id);
            }
        }

        let store = store_in(&file);
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hi").expect("a turn");

        assert!(
            !earlier.contains(&session.id),
            "{} was used before",
            session.id
        );
        assert!(!earlier.contains(&turn.id), "{} was used before", turn.id);
    }

    #[test]
    fn the_session_written_in_last_is_listed_first() {
        let store = store();
        let older = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let newer = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        store.start_turn(&older.id, "Back to this").expect("a turn");

        let ids: Vec<String> = store.list().projects[0]
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect();
        assert_eq!(ids, vec![older.id.clone(), newer.id]);
        let listed = &store.list().projects[0].sessions[0];
        assert!(listed.updated_at >= older.created_at);
    }

    #[test]
    fn the_order_of_use_is_kept_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let (older, newer) = {
            let store = store_in(&file);
            let older = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            let newer = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            store.start_turn(&older.id, "Back to this").expect("a turn");
            (older.id, newer.id)
        };

        let ids: Vec<String> = store_in(&file).list().projects[0]
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect();

        assert_eq!(ids, vec![older, newer]);
    }

    #[test]
    fn an_opened_folder_is_still_a_project_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let project = {
            let store = store_in(&file);
            let project = store
                .open_folder(Path::new(r"C:\Work\my-app"))
                .expect("a project");
            store
                .create_session(&project.id, AgentKind::Demo)
                .expect("a session");
            project
        };

        let listing = store_in(&file).list().projects;

        assert_eq!(listing.len(), 2);
        assert_eq!(listing[0].project.id, playground::PLAYGROUND_ID);
        assert_eq!(listing[1].project, project);
        assert_eq!(listing[1].sessions.len(), 1);
    }

    #[test]
    fn the_playground_is_where_it_is_on_this_start() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        drop(store_in(&file));

        let moved = SessionStore::open(&file, &playground::describe(Path::new(r"D:\Moved")));

        assert!(moved.problem.is_none());
        assert_eq!(moved.store.list().projects[0].project.path, r"D:\Moved");
    }

    #[test]
    fn a_file_that_cannot_be_read_is_set_aside_and_the_store_starts_empty() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        std::fs::write(&file, "this is not a database, it is a note").expect("a broken file");
        let now = OffsetDateTime::parse("2026-09-30T14:05:09Z", &Rfc3339).expect("a time");

        let opened = SessionStore::open_at(
            &file,
            &playground::describe(Path::new(r"C:\Playground")),
            now,
        );

        let kept = folder.path().join("sessions.invalid-20260930-140509.db");
        let Some(OpenProblem::SetAside { kept_as, reason }) = opened.problem else {
            panic!("the file is set aside, not {:?}", opened.problem);
        };
        assert_eq!(kept_as, kept);
        assert!(!reason.is_empty());
        assert_eq!(
            std::fs::read_to_string(&kept).expect("the file is kept"),
            "this is not a database, it is a note"
        );
        let listing = opened.store.list().projects;
        assert_eq!(listing.len(), 1);
        assert!(listing[0].sessions.is_empty());
        // The new file is used from now on.
        let session = opened
            .store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        drop(opened.store);
        assert_eq!(
            store_in(&file).list().projects[0].sessions[0].id,
            session.id
        );
    }

    #[test]
    fn a_file_that_cannot_be_opened_leaves_the_sessions_in_memory() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        // A folder where the file should be: nothing can be opened or set aside there.
        let file = folder.path().join("sessions.db");
        std::fs::create_dir(&file).expect("a folder in the way");

        let opened = SessionStore::open(&file, &playground::describe(Path::new(r"C:\Playground")));

        assert!(
            matches!(opened.problem, Some(OpenProblem::NotSaving { .. })),
            "{:?}",
            opened.problem
        );
        let session = opened
            .store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session works in memory");
        assert_eq!(opened.store.list().projects[0].sessions[0].id, session.id);
    }

    #[test]
    fn finished_turns_added_at_once_are_there_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let id = {
            let store = store_in(&file);
            let session = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            let replies = (1..=500)
                .map(|number| {
                    (
                        format!("Message number {number}"),
                        vec![Item::Text {
                            id: format!("reply-{number}"),
                            text: format!("Reply number {number}"),
                        }],
                    )
                })
                .collect();
            store
                .add_finished_turns(&session.id, replies)
                .expect("the turns are written");
            session.id
        };

        let session = store_in(&file).session(&id).expect("the session");

        assert_eq!(session.title.as_deref(), Some("Message number 1"));
        assert_eq!(session.turns.len(), 500);
        assert_eq!(session.turns[499].prompt, "Message number 500");
        assert!(
            session
                .turns
                .iter()
                .all(|turn| turn.status == TurnStatus::Done)
        );
    }

    #[test]
    fn the_session_opened_last_is_remembered_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let second = {
            let store = store_in(&file);
            assert_eq!(store.last_open(), None, "nothing was opened yet");
            let first = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            let second = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            store.remember_open(&second.id).expect("remembered");
            store.remember_open(&first.id).expect("remembered");
            store.remember_open(&second.id).expect("remembered");
            second.id
        };

        assert_eq!(store_in(&file).last_open(), Some(second));
    }

    #[test]
    fn a_session_that_does_not_exist_is_not_remembered() {
        let store = store();

        assert_eq!(
            store.remember_open("session-99"),
            Err(StoreError::UnknownSession)
        );
        assert_eq!(store.last_open(), None);
    }

    #[test]
    fn a_renamed_session_keeps_its_name_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let id = {
            let store = store_in(&file);
            let session = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            store
                .rename(&session.id, "  The build fix  ")
                .expect("renamed");
            session.id
        };

        let store = store_in(&file);

        assert_eq!(
            store.list().projects[0].sessions[0].title.as_deref(),
            Some("The build fix"),
            "the name is trimmed"
        );
        assert_eq!(
            store.session(&id).expect("the session").title.as_deref(),
            Some("The build fix")
        );
    }

    #[test]
    fn a_renamed_session_keeps_its_name_when_its_first_message_is_sent() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        store.rename(&session.id, "Chosen name").expect("renamed");

        store
            .start_turn(&session.id, "The first message")
            .expect("a turn");

        assert_eq!(
            store
                .session(&session.id)
                .expect("the session")
                .title
                .as_deref(),
            Some("Chosen name")
        );
    }

    #[test]
    fn a_name_needs_1_to_100_characters_after_trimming() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");

        assert_eq!(
            store.rename(&session.id, "   "),
            Err(StoreError::InvalidName)
        );
        assert_eq!(
            store.rename(&session.id, &"é".repeat(101)),
            Err(StoreError::InvalidName)
        );
        assert_eq!(store.rename(&session.id, &"é".repeat(100)), Ok(()));
        assert_eq!(
            store.rename("session-99", "A name"),
            Err(StoreError::UnknownSession)
        );
    }

    fn ids(sessions: &[SessionSummary]) -> Vec<&str> {
        sessions.iter().map(|session| session.id.as_str()).collect()
    }

    fn three_sessions(store: &SessionStore) -> [String; 3] {
        [(); 3].map(|()| {
            store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session")
                .id
        })
    }

    #[test]
    fn pinned_sessions_are_listed_apart_in_the_order_they_were_pinned() {
        let store = store();
        let [first, second, third] = three_sessions(&store);

        store.set_pinned(&third, true).expect("pinned");
        store.set_pinned(&first, true).expect("pinned");

        let list = store.list();
        assert_eq!(ids(&list.pinned), vec![third.as_str(), first.as_str()]);
        assert!(list.pinned.iter().all(|session| session.pinned));
        assert_eq!(
            ids(&list.projects[0].sessions),
            vec![second.as_str()],
            "a pinned session leaves its project's list"
        );
        assert!(store.session(&first).expect("the session").pinned);
    }

    #[test]
    fn pinning_a_pinned_session_again_keeps_its_place_and_unpinning_puts_it_back() {
        let store = store();
        let [first, second, third] = three_sessions(&store);
        store.set_pinned(&first, true).expect("pinned");
        store.set_pinned(&second, true).expect("pinned");

        store.set_pinned(&first, true).expect("pinned again");
        assert_eq!(
            ids(&store.list().pinned),
            vec![first.as_str(), second.as_str()]
        );

        store.set_pinned(&first, false).expect("unpinned");
        let list = store.list();
        assert_eq!(ids(&list.pinned), vec![second.as_str()]);
        assert_eq!(
            ids(&list.projects[0].sessions),
            vec![third.as_str(), first.as_str()]
        );
        assert!(!store.session(&first).expect("the session").pinned);
        assert_eq!(
            store.set_pinned("session-99", true),
            Err(StoreError::UnknownSession)
        );
    }

    #[test]
    fn pins_and_their_order_are_kept_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let [first, _, third] = {
            let store = store_in(&file);
            let sessions = three_sessions(&store);
            store.set_pinned(&sessions[2], true).expect("pinned");
            store.set_pinned(&sessions[0], true).expect("pinned");
            sessions
        };

        assert_eq!(
            ids(&store_in(&file).list().pinned),
            vec![third.as_str(), first.as_str()]
        );
    }

    #[test]
    fn a_deleted_session_is_gone_from_the_list_and_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let kept = {
            let store = store_in(&file);
            let [first, second, third] = three_sessions(&store);
            store.set_pinned(&third, true).expect("pinned");

            store.delete(&second).expect("deleted");
            store.delete(&third).expect("deleted");

            assert_eq!(
                ids(&store.list().projects[0].sessions),
                vec![first.as_str()]
            );
            assert!(store.list().pinned.is_empty());
            assert_eq!(store.session(&second), Err(StoreError::UnknownSession));
            assert_eq!(store.delete(&second), Err(StoreError::UnknownSession));
            first
        };

        let store = store_in(&file);
        assert_eq!(ids(&store.list().projects[0].sessions), vec![kept.as_str()]);
        assert!(store.list().pinned.is_empty());
    }

    #[test]
    fn the_text_of_a_deleted_session_does_not_stay_in_the_file() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let secret = "a note only this session ever held";
        let in_the_files = || {
            ["", "-wal"].iter().any(|ending| {
                let mut path = file.clone().into_os_string();
                path.push(ending);
                std::fs::read(&path).is_ok_and(|bytes| {
                    bytes
                        .windows(secret.len())
                        .any(|window| window == secret.as_bytes())
                })
            })
        };
        let store = store_in(&file);
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, secret).expect("a turn");
        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |_| true)
            .expect("saved");
        assert!(in_the_files(), "the text was written");

        store.delete(&session.id).expect("deleted");

        assert!(!in_the_files(), "the text was overwritten");
    }

    #[test]
    fn deleting_a_session_stops_its_reply() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hello").expect("a turn");

        let mut heard = Vec::new();
        let saved = store.stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
            heard.push(event.clone());
            if heard.len() == 2 {
                store.delete(&session.id).expect("deleted");
            }
            true
        });

        assert_eq!(saved, Ok(()));
        assert_eq!(
            heard.len(),
            3,
            "the reply stopped at the next event: {heard:?}"
        );
        assert!(matches!(heard.last(), Some(TurnEvent::Stopped { .. })));
        assert!(store.list().projects[0].sessions.is_empty());
    }

    #[test]
    fn a_deleted_session_is_not_remembered_as_the_last_one_opened() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        {
            let store = store_in(&file);
            let session = store
                .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
                .expect("a session");
            store.remember_open(&session.id).expect("remembered");

            store.delete(&session.id).expect("deleted");

            assert_eq!(store.last_open(), None);
        }

        assert_eq!(store_in(&file).last_open(), None);
    }

    #[test]
    fn archived_sessions_leave_the_lists_and_are_listed_apart_the_last_archived_first() {
        let store = store();
        let [first, second, third] = three_sessions(&store);
        store.set_pinned(&first, true).expect("pinned");

        store.set_archived(&first, true).expect("archived");
        store.set_archived(&third, true).expect("archived");

        let list = store.list();
        assert_eq!(ids(&list.archived), vec![third.as_str(), first.as_str()]);
        assert!(list.pinned.is_empty(), "archiving unpins");
        assert_eq!(ids(&list.projects[0].sessions), vec![second.as_str()]);
        let archived = store.session(&first).expect("the session");
        assert!(archived.archived_at.is_some());
        assert!(!archived.pinned);

        store.set_archived(&first, false).expect("unarchived");

        let list = store.list();
        assert_eq!(ids(&list.archived), vec![third.as_str()]);
        assert!(list.pinned.is_empty(), "no pin comes back");
        assert_eq!(
            ids(&list.projects[0].sessions),
            vec![second.as_str(), first.as_str()]
        );
        assert_eq!(
            store.session(&first).expect("the session").archived_at,
            None
        );
    }

    #[test]
    fn archiving_an_archived_session_again_keeps_its_place_and_date() {
        let store = store();
        let [first, second, _] = three_sessions(&store);
        store.set_archived(&first, true).expect("archived");
        store.set_archived(&second, true).expect("archived");
        let date = store.session(&first).expect("the session").archived_at;

        store.set_archived(&first, true).expect("archived again");

        assert_eq!(
            ids(&store.list().archived),
            vec![second.as_str(), first.as_str()]
        );
        assert_eq!(
            store.session(&first).expect("the session").archived_at,
            date
        );
    }

    #[test]
    fn archived_sessions_and_their_order_are_kept_after_a_restart() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("sessions.db");
        let [first, _, third] = {
            let store = store_in(&file);
            let sessions = three_sessions(&store);
            store.set_archived(&sessions[0], true).expect("archived");
            store.set_archived(&sessions[2], true).expect("archived");
            sessions
        };

        let store = store_in(&file);

        assert_eq!(
            ids(&store.list().archived),
            vec![third.as_str(), first.as_str()]
        );
        assert!(
            store
                .session(&first)
                .expect("the session")
                .archived_at
                .is_some()
        );
    }

    #[test]
    fn an_archived_session_takes_no_message_name_or_pin_until_it_is_unarchived() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        store.set_archived(&session.id, true).expect("archived");

        assert_eq!(
            store.start_turn(&session.id, "hello"),
            Err(StoreError::Archived)
        );
        assert_eq!(
            store.rename(&session.id, "A name"),
            Err(StoreError::Archived)
        );
        assert_eq!(
            store.set_pinned(&session.id, true),
            Err(StoreError::Archived)
        );

        store.set_archived(&session.id, false).expect("unarchived");
        assert!(store.start_turn(&session.id, "hello").is_ok());
    }

    #[test]
    fn archiving_a_session_stops_its_reply() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        let turn = store.start_turn(&session.id, "hello").expect("a turn");

        let mut heard = Vec::new();
        store
            .stream_reply(&DemoDriver::instant(), &session.id, &turn, |event| {
                heard.push(event.clone());
                if heard.len() == 2 {
                    store.set_archived(&session.id, true).expect("archived");
                }
                true
            })
            .expect("saved");

        assert!(matches!(heard.last(), Some(TurnEvent::Stopped { .. })));
        let saved = store.session(&session.id).expect("the session");
        assert_eq!(saved.turns[0].status, TurnStatus::Stopped);
        assert!(saved.archived_at.is_some());
    }

    #[test]
    fn an_archived_session_is_not_opened_again_at_the_next_start() {
        let store = store();
        let session = store
            .create_session(playground::PLAYGROUND_ID, AgentKind::Demo)
            .expect("a session");
        store.remember_open(&session.id).expect("remembered");

        store.set_archived(&session.id, true).expect("archived");

        assert_eq!(store.last_open(), None);
    }

    #[test]
    fn events_for_things_that_are_gone_are_ignored() {
        let store = store();

        assert_eq!(
            store.apply(
                "session-99",
                &TurnEvent::Finished {
                    turn_id: "turn-1".into(),
                },
            ),
            Ok(())
        );
    }
}
