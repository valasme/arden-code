//! The file the sessions are kept in between starts (ADR 0035): a SQLite database in the app's local
//! folder. The store keeps the sessions in memory while the app runs, and writes each change here.

use std::fmt;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::model::{Item, Project, Session, Turn, TurnStatus};

/// The version of the tables, kept in SQLite's `user_version`. Each later version comes with the
/// migration that brings the file up to it from the one before.
const VERSION: i64 = 7;

/// The tables of version 1, which every file starts from.
pub(crate) const TABLES: &str = "
CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    position INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects (id),
    agent TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    used INTEGER NOT NULL,
    pinned INTEGER,
    archived INTEGER,
    archived_at TEXT,
    linked_from TEXT REFERENCES sessions (id) ON DELETE SET NULL
) STRICT;

CREATE TABLE turns (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL,
    items TEXT NOT NULL
) STRICT;

CREATE INDEX turns_of_a_session ON turns (session_id, position);
";

/// The migrations, each bringing the file to the version after the one it starts from: the first
/// brings version 1 to version 2.
const MIGRATIONS: &[&str] = &[
    // Version 2: the agent's own conversation for each session, to carry on after a restart
    // (ADR 0039).
    "ALTER TABLE sessions ADD COLUMN conversation TEXT;",
    // Version 3: whether the person trusts each project's folder (ADR 0039).
    "ALTER TABLE projects ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0;",
    // Version 4: the model each session works with, none for the agent's own setting (ADR 0041).
    "ALTER TABLE sessions ADD COLUMN model TEXT;",
    // Version 5: the effort each session works with, none for the agent's own setting (ADR 0041).
    "ALTER TABLE sessions ADD COLUMN effort TEXT;",
    // Version 6: how full each session's context window is, as its agent last reported (ADR 0044).
    "ALTER TABLE sessions ADD COLUMN context_window TEXT;",
    // Version 7: how freely each session's agent may act before it asks, none for Manual (ADR 0044).
    "ALTER TABLE sessions ADD COLUMN permission_mode TEXT;",
];

/// What went wrong with the file, in words for the logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseError(pub String);

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<serde_json::Error> for DatabaseError {
    fn from(error: serde_json::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self(error.to_string())
    }
}

/// Where a session stands in the sidebar's lists: numbers that only grow, given when it was last
/// used, pinned and archived.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Order {
    /// When it was last used: the most recently used is listed first.
    pub used: u64,
    /// When it was pinned, while it is: the first pinned is listed first.
    pub pinned: Option<u64>,
    /// When it was archived, while it is: the last archived is listed first.
    pub archived: Option<u64>,
}

/// A session as the file lists it: everything but its turns, which are read when it is opened.
pub struct SavedSession {
    pub session: Session,
    pub order: Order,
    /// The agent's own conversation, once the agent has answered in it.
    pub conversation: Option<String>,
}

/// Everything the file holds but the turns.
pub struct Saved {
    /// The projects, in the order they were opened, the Playground first.
    pub projects: Vec<Project>,
    pub sessions: Vec<SavedSession>,
    /// The last number given to an id, so the next one is new.
    pub last_id: u64,
    /// The session that was opened last, if any.
    pub last_open: Option<String>,
}

/// The name serde gives a value, such as `demo` for `AgentKind::Demo`.
fn name_of(value: impl Serialize) -> rusqlite::Result<String> {
    match serde_json::to_value(value) {
        Ok(serde_json::Value::String(name)) => Ok(name),
        Ok(other) => Err(rusqlite::Error::ToSqlConversionFailure(
            format!("{other} is not a name").into(),
        )),
        Err(error) => Err(rusqlite::Error::ToSqlConversionFailure(Box::new(error))),
    }
}

/// The value serde gives a name, the other way round from [`name_of`].
/// A value the file keeps as JSON text, such as a session's context window.
fn json_of(value: impl Serialize) -> rusqlite::Result<String> {
    serde_json::to_string(&value)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn from_name<T: DeserializeOwned>(name: String) -> rusqlite::Result<T> {
    serde_json::from_value(serde_json::Value::String(name)).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

/// A number the file keeps as an `INTEGER`, which SQLite holds as a signed number.
fn stored(number: u64) -> i64 {
    i64::try_from(number).unwrap_or(i64::MAX)
}

fn put_project(
    transaction: &Transaction<'_>,
    project: &Project,
    position: usize,
) -> rusqlite::Result<()> {
    transaction.execute(
        "INSERT INTO projects (id, kind, name, path, position, trusted) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, path = excluded.path",
        params![
            project.id,
            name_of(project.kind)?,
            project.name,
            project.path,
            stored(position as u64),
            project.trusted
        ],
    )?;
    Ok(())
}

// An upsert, never `INSERT OR REPLACE`: replacing a row deletes it first, and its turns with it.
fn put_session(
    transaction: &Transaction<'_>,
    session: &Session,
    order: Order,
) -> rusqlite::Result<()> {
    transaction.execute(
        "INSERT INTO sessions (id, project_id, agent, title, created_at, updated_at, used, pinned,
             archived, archived_at, linked_from, model, effort, context_window, permission_mode)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT (id) DO UPDATE SET project_id = excluded.project_id, agent = excluded.agent,
             title = excluded.title, updated_at = excluded.updated_at,
             used = excluded.used, pinned = excluded.pinned, archived = excluded.archived,
             archived_at = excluded.archived_at, linked_from = excluded.linked_from,
             model = excluded.model, effort = excluded.effort,
             context_window = excluded.context_window,
             permission_mode = excluded.permission_mode",
        params![
            session.id,
            session.project_id,
            name_of(session.agent)?,
            session.title,
            session.created_at,
            session.updated_at,
            stored(order.used),
            order.pinned.map(stored),
            order.archived.map(stored),
            session.archived_at,
            session.linked_from,
            session.model.as_ref().map(name_of).transpose()?,
            session.effort.map(name_of).transpose()?,
            session.context_window.as_ref().map(json_of).transpose()?,
            name_of(session.permission_mode)?,
        ],
    )?;
    Ok(())
}

fn put_turn(
    transaction: &Transaction<'_>,
    session_id: &str,
    position: usize,
    turn: &Turn,
) -> rusqlite::Result<()> {
    let items = serde_json::to_string(&turn.items)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    transaction.execute(
        "INSERT INTO turns (id, session_id, position, prompt, started_at, status, items)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, items = excluded.items",
        params![
            turn.id,
            session_id,
            stored(position as u64),
            turn.prompt,
            turn.started_at,
            name_of(turn.status)?,
            items,
        ],
    )?;
    Ok(())
}

/// The sessions file, open.
pub struct Database {
    connection: Connection,
}

impl Database {
    /// A database that lives in memory only, and is gone when the app closes.
    ///
    /// # Panics
    ///
    /// When SQLite cannot make a database in memory, which only happens when memory runs out.
    #[must_use]
    pub fn in_memory() -> Self {
        let connection =
            Connection::open_in_memory().expect("SQLite can make a database in memory");
        let mut database = Self { connection };
        database
            .prepare()
            .expect("a database in memory can be prepared");
        database
    }

    /// Opens the file, making it when it is not there, and brings its tables up to date.
    ///
    /// # Errors
    ///
    /// When the file cannot be opened or written, is not a database, or was made by a newer version
    /// of Arden Code.
    pub fn open(file: &Path) -> Result<Self, DatabaseError> {
        if let Some(folder) = file.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let connection = Connection::open(file)?;
        // Write-ahead logging, and a sync at each checkpoint rather than at each change: a power cut
        // can lose the last change, never the file.
        connection
            .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
        let mut database = Self { connection };
        database.prepare()?;
        Ok(database)
    }

    fn prepare(&mut self) -> Result<(), DatabaseError> {
        self.connection
            .pragma_update(None, "synchronous", "NORMAL")?;
        self.connection.pragma_update(None, "foreign_keys", true)?;
        // What is deleted is overwritten, so the text of a deleted session does not stay in the file.
        self.connection.pragma_update(None, "secure_delete", true)?;
        let version: i64 = self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > VERSION {
            return Err(DatabaseError(format!(
                "the file is version {version}, made by a newer Arden Code; this one reads version {VERSION}"
            )));
        }
        if version == VERSION {
            return Ok(());
        }
        let transaction = self.connection.transaction()?;
        if version == 0 {
            transaction.execute_batch(TABLES)?;
        }
        let from = usize::try_from(version.max(1) - 1).unwrap_or_default();
        for migration in &MIGRATIONS[from..] {
            transaction.execute_batch(migration)?;
        }
        transaction.pragma_update(None, "user_version", VERSION)?;
        transaction.commit()?;
        Ok(())
    }

    /// Reads what the file holds, apart from the turns. The Playground is written with its folder of
    /// today, and a reply that was still running when the app last closed is marked as failed.
    ///
    /// # Errors
    ///
    /// When the file cannot be read or holds something this version cannot understand.
    pub fn load(&mut self, playground: &Project) -> Result<Saved, DatabaseError> {
        let transaction = self.connection.transaction()?;
        put_project(&transaction, playground, 0)?;
        transaction.execute(
            "UPDATE turns SET status = 'failed' WHERE status = 'running'",
            [],
        )?;
        transaction.commit()?;

        let mut statement = self.connection.prepare(
            "SELECT id, kind, name, path, trusted FROM projects ORDER BY position, rowid",
        )?;
        let projects = statement
            .query_map([], |row| {
                Ok(Project {
                    id: row.get(0)?,
                    kind: from_name(row.get(1)?)?,
                    name: row.get(2)?,
                    path: row.get(3)?,
                    trusted: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut statement = self.connection.prepare(
            "SELECT id, project_id, agent, title, created_at, updated_at, used, pinned, archived,
                archived_at, linked_from, conversation, model, effort, context_window,
                permission_mode
             FROM sessions ORDER BY rowid",
        )?;
        let sessions = statement
            .query_map([], |row| {
                let number = |value: i64| u64::try_from(value).unwrap_or_default();
                let order = Order {
                    used: number(row.get(6)?),
                    pinned: row.get::<_, Option<i64>>(7)?.map(number),
                    archived: row.get::<_, Option<i64>>(8)?.map(number),
                };
                Ok(SavedSession {
                    session: Session {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        agent: from_name(row.get(2)?)?,
                        title: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        pinned: order.pinned.is_some(),
                        archived_at: row.get(9)?,
                        linked_from: row.get(10)?,
                        model: row
                            .get::<_, Option<String>>(12)?
                            .map(from_name)
                            .transpose()?,
                        effort: row
                            .get::<_, Option<String>>(13)?
                            .map(from_name)
                            .transpose()?,
                        // A figure the file cannot give back is left out: the next reply reports it.
                        context_window: row
                            .get::<_, Option<String>>(14)?
                            .and_then(|text| serde_json::from_str(&text).ok()),
                        // A mode this version does not know is read as Manual, which asks.
                        permission_mode: row
                            .get::<_, Option<String>>(15)?
                            .and_then(|name| from_name(name).ok())
                            .unwrap_or_default(),
                        turns: Vec::new(),
                    },
                    order,
                    conversation: row.get(11)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let last_id = self
            .meta("last_id")?
            .and_then(|value| value.parse().ok())
            .unwrap_or_default();
        let last_open = self.meta("last_open")?;

        Ok(Saved {
            projects,
            sessions,
            last_id,
            last_open,
        })
    }

    fn meta(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.connection
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
    }

    /// The turns of a session, in order.
    ///
    /// # Errors
    ///
    /// When they cannot be read.
    pub fn turns(&self, session_id: &str) -> Result<Vec<Turn>, DatabaseError> {
        let mut statement = self.connection.prepare(
            "SELECT id, prompt, started_at, status, items FROM turns WHERE session_id = ?1 ORDER BY position",
        )?;
        let rows = statement
            .query_map([session_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    from_name(row.get(3)?)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter()
            .map(|(id, prompt, started_at, status, items)| {
                let mut turn = Turn {
                    id,
                    prompt,
                    started_at,
                    status,
                    items: serde_json::from_str::<Vec<Item>>(&items)?,
                };
                // A reply written while it waited for the person, and never finished, is over.
                if turn.status != TurnStatus::Running {
                    turn.settle();
                }
                Ok(turn)
            })
            .collect()
    }

    /// Makes one change in one transaction, and keeps the last number given to an id with it.
    fn write(
        &mut self,
        last_id: u64,
        change: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<()>,
    ) -> Result<(), DatabaseError> {
        let transaction = self.connection.transaction()?;
        change(&transaction)?;
        transaction.execute(
            "INSERT INTO meta (key, value) VALUES ('last_id', ?1)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [last_id.to_string()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    /// Remembers the session that was opened last.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_last_open(&mut self, session_id: &str, last_id: u64) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            transaction.execute(
                "INSERT INTO meta (key, value) VALUES ('last_open', ?1)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                [session_id],
            )?;
            Ok(())
        })
    }

    /// Deletes a session and its turns, and forgets it as the session opened last when
    /// `forget_last_open` says it was. Sessions linked from it lose their link. What they held is overwritten in the file (`secure_delete`),
    /// and the log of changes is folded into the file and emptied, so no earlier copy of it stays.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn delete_session(
        &mut self,
        session_id: &str,
        forget_last_open: bool,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            transaction.execute("DELETE FROM sessions WHERE id = ?1", [session_id])?;
            if forget_last_open {
                transaction.execute("DELETE FROM meta WHERE key = 'last_open'", [])?;
            }
            Ok(())
        })?;
        self.connection
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
        Ok(())
    }

    /// Deletes a project at its place in the list, with its sessions and their turns, as
    /// `delete_session` deletes one session; the projects after it move up a place. Forgets the
    /// session opened last when `forget_last_open` says it was one of them.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn delete_project(
        &mut self,
        project_id: &str,
        position: usize,
        forget_last_open: bool,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        let position = i64::try_from(position).unwrap_or(i64::MAX);
        self.write(last_id, |transaction| {
            transaction.execute("DELETE FROM sessions WHERE project_id = ?1", [project_id])?;
            transaction.execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
            transaction.execute(
                "UPDATE projects SET position = position - 1 WHERE position > ?1",
                [position],
            )?;
            if forget_last_open {
                transaction.execute("DELETE FROM meta WHERE key = 'last_open'", [])?;
            }
            Ok(())
        })?;
        self.connection
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
        Ok(())
    }

    /// Remembers the agent's own conversation for a session, to carry on in it after a restart.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_conversation(
        &mut self,
        session_id: &str,
        conversation: &str,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            transaction.execute(
                "UPDATE sessions SET conversation = ?2 WHERE id = ?1",
                [session_id, conversation],
            )?;
            Ok(())
        })
    }

    /// Remembers that the person trusts a project's folder.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_trust(&mut self, project_id: &str, last_id: u64) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            transaction.execute(
                "UPDATE projects SET trusted = 1 WHERE id = ?1",
                [project_id],
            )?;
            Ok(())
        })
    }

    /// Writes a project that was opened, at its place in the list.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_project(
        &mut self,
        project: &Project,
        position: usize,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_project(transaction, project, position)
        })
    }

    /// Writes a session, but not its turns.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_session(
        &mut self,
        session: &Session,
        order: Order,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_session(transaction, session, order)
        })
    }

    /// Writes a session and some of its turns, each with its place in the session, at once.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_session_and_turns(
        &mut self,
        session: &Session,
        order: Order,
        turns: &[(usize, &Turn)],
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_session(transaction, session, order)?;
            for (position, turn) in turns {
                put_turn(transaction, &session.id, *position, turn)?;
            }
            Ok(())
        })
    }

    /// Writes a turn as it is now, at its place in its session.
    ///
    /// # Errors
    ///
    /// When the file cannot be written.
    pub fn save_turn(
        &mut self,
        session_id: &str,
        position: usize,
        turn: &Turn,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_turn(transaction, session_id, position, turn)
        })
    }
}
