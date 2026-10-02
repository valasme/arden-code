//! The file the sessions are kept in between starts (ADR 0035): a SQLite database in the app's local
//! folder. The store keeps the sessions in memory while the app runs, and writes each change here.

use std::fmt;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::model::{Item, Project, Session, Turn};

/// The version of the tables below, kept in SQLite's `user_version`. A later version comes with the
/// migration that brings an older file up to it.
const VERSION: i64 = 1;

const TABLES: &str = "
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
    used INTEGER NOT NULL
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

/// A session as the file lists it: everything but its turns, which are read when it is opened.
pub struct SavedSession {
    pub session: Session,
    /// When it was last used, as a number that only grows.
    pub used: u64,
}

/// Everything the file holds but the turns.
pub struct Saved {
    /// The projects, in the order they were opened, the Playground first.
    pub projects: Vec<Project>,
    pub sessions: Vec<SavedSession>,
    /// The last number given to an id, so the next one is new.
    pub last_id: u64,
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
        "INSERT INTO projects (id, kind, name, path, position) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, path = excluded.path",
        params![project.id, name_of(project.kind)?, project.name, project.path, stored(position as u64)],
    )?;
    Ok(())
}

// An upsert, never `INSERT OR REPLACE`: replacing a row deletes it first, and its turns with it.
fn put_session(
    transaction: &Transaction<'_>,
    session: &Session,
    used: u64,
) -> rusqlite::Result<()> {
    transaction.execute(
        "INSERT INTO sessions (id, project_id, agent, title, created_at, updated_at, used)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at,
             used = excluded.used",
        params![
            session.id,
            session.project_id,
            name_of(session.agent)?,
            session.title,
            session.created_at,
            session.updated_at,
            stored(used),
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
        match version {
            0 => {
                let transaction = self.connection.transaction()?;
                transaction.execute_batch(TABLES)?;
                transaction.pragma_update(None, "user_version", VERSION)?;
                transaction.commit()?;
            }
            VERSION => {}
            newer => {
                return Err(DatabaseError(format!(
                    "the file is version {newer}, made by a newer Arden Code; this one reads version {VERSION}"
                )));
            }
        }
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

        let mut statement = self
            .connection
            .prepare("SELECT id, kind, name, path FROM projects ORDER BY position, rowid")?;
        let projects = statement
            .query_map([], |row| {
                Ok(Project {
                    id: row.get(0)?,
                    kind: from_name(row.get(1)?)?,
                    name: row.get(2)?,
                    path: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut statement = self.connection.prepare(
            "SELECT id, project_id, agent, title, created_at, updated_at, used FROM sessions ORDER BY rowid",
        )?;
        let sessions = statement
            .query_map([], |row| {
                Ok(SavedSession {
                    session: Session {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        agent: from_name(row.get(2)?)?,
                        title: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        turns: Vec::new(),
                    },
                    used: u64::try_from(row.get::<_, i64>(6)?).unwrap_or_default(),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let last_id = self
            .meta("last_id")?
            .and_then(|value| value.parse().ok())
            .unwrap_or_default();

        Ok(Saved {
            projects,
            sessions,
            last_id,
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
                Ok(Turn {
                    id,
                    prompt,
                    started_at,
                    status,
                    items: serde_json::from_str::<Vec<Item>>(&items)?,
                })
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
        used: u64,
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_session(transaction, session, used)
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
        used: u64,
        turns: &[(usize, &Turn)],
        last_id: u64,
    ) -> Result<(), DatabaseError> {
        self.write(last_id, |transaction| {
            put_session(transaction, session, used)?;
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
