# 0035. Saving sessions

- Status: Accepted
- Date: 2026-10-02
- Supersedes the storage part of [0016](0016-chat-placeholder-and-demo-agent.md), and changes plan sections 1, 4, 5.6,
  6.8 and 13.

## Context

Sessions live in memory (ADR 0016), so everything in them is gone when Arden Code closes. That was fine while a
session could only be read and written in. Now sessions are to be pinned, archived, renamed and linked (ADR 0036), and
each of those is a promise about later: an archive that empties at the next start is not an archive. The setting
"On startup: Restore the last session", the default, also has nothing to restore. The plan says SQLite arrives with
the first feature that needs persistence; this is that feature.

The options were SQLite in the local data folder, a JSON file per session, and SQLite in the roaming data folder next
to the settings.

## Decision

- **SQLite, through rusqlite with its bundled SQLite,** in `sessions.db` in the local data folder
  (`%LOCALAPPDATA%\io.github.valasme.arden`, or `ARDEN_CODE_DATA_DIR\local`). A transcript can run to megabytes, so
  it does not roam with the Windows profile; the settings, which do, stay in their JSON file. A JSON file per session
  was turned down: every turn would rewrite the whole file, and listing the sessions would read every file.
- **The `arden-agents` crate owns it.** The `SessionStore` stays the truth while the app runs, and a database beside it
  receives each change. Rust still owns the sessions, and the UI still reads them through commands.
- **What is written, and when:** a project when it is opened; a session when it is made and when it changes (its name,
  pin, archive or link); a turn when its message is sent and when its reply ends, with its items as JSON. Nothing is
  written while a reply streams, so streaming keeps its frame rate. Each change is one transaction, and the debug
  session of 10,000 messages is one transaction too.
- **What is read, and when:** the projects and the list of sessions at start, and a session's turns the first time it
  is opened. A session of 10,000 messages costs nothing until it is opened, so the start keeps to its targets.
- **A reply cut off** by closing the app, or by a crash, is found still running at the next start and becomes failed,
  with any tool that was running. The text that had streamed is lost: it was never written. Real agents keep their own
  transcripts.
- **Ids are never reused.** The counter behind `session-…`, `turn-…` and `folder-…` is saved with every change that
  uses it, so an old link never opens another session.
- **The file's settings:** write-ahead logging, `synchronous = NORMAL` (a power cut can lose the last change, never
  the file), foreign keys on, and `secure_delete`, so the text of a deleted session does not stay in the file's free
  pages. The schema's version is SQLite's `user_version`, and each version has its migration and a test.
- **A file that cannot be read** is set aside as `sessions.invalid-<date>.db`, and the app starts with no sessions and
  a notice (`ARD-AGT-004`), as it does for a broken settings file (ADR 0012). **A file that cannot be written** leaves
  the sessions working in memory until the app closes, and the notice says they are not being saved (`ARD-AGT-003`).
  An action the person takes, such as renaming, is written before it changes the store, so a failed write changes
  nothing and says so.
- **Reset Arden Code and the uninstaller** delete the file with the rest of the local folder, and now say so.
- **Diagnostics never include it.** The bundle holds the logs, the redacted settings, system information and crash
  reports, and the logs name sessions by their id only.

## Consequences

- Sessions, and what is done to them, last across restarts, and restoring the last session at start becomes possible
  (ADR 0036).
- The app carries SQLite, compiled from C when the app is built. The build already compiles C, for `ring`.
- Every change to the schema needs a migration and a test, as the settings do.
- The text of a reply that is running when the app closes is lost. Writing a running reply now and then can come
  later, if real agents need it.
