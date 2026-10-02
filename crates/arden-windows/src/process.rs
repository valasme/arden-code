//! Processes: telling one apart from a later one that gets the same number, and waiting for one and
//! everything it started to end.

// Every call into Windows here is unsafe. Each block says why it is sound.
#![allow(unsafe_code)]

use std::collections::HashMap;
use std::fmt;
use std::io;
use std::mem::size_of;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::Child;
use std::str::FromStr;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, WAIT_TIMEOUT};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

/// A process: its number, and when it started. Windows gives a number to a new process once the
/// old one with it has ended, so the number alone can mean another process later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Identity {
    /// The process id.
    pub id: u32,
    /// When it started, in Windows' 100-nanosecond steps since 1601.
    started: u64,
}

impl Identity {
    /// The identity of this process.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows does not say when it started.
    pub fn current() -> io::Result<Self> {
        // SAFETY: the pseudo handle of this process is always valid, and needs no closing.
        let started = started(unsafe { GetCurrentProcess() })?;
        Ok(Self {
            id: std::process::id(),
            started,
        })
    }

    /// The identity of a process this one started.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows does not say when it started.
    pub fn of(child: &Child) -> io::Result<Self> {
        let started = started(HANDLE(child.as_raw_handle()))?;
        Ok(Self {
            id: child.id(),
            started,
        })
    }
}

/// The identity as text, `<id>:<started>`, to hand to another process.
impl fmt::Display for Identity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}:{}", self.id, self.started)
    }
}

/// Text that is not `<id>:<started>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotAnIdentity;

impl fmt::Display for NotAnIdentity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("not a process identity")
    }
}

impl std::error::Error for NotAnIdentity {}

impl FromStr for Identity {
    type Err = NotAnIdentity;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let (id, started) = text.split_once(':').ok_or(NotAnIdentity)?;
        Ok(Self {
            id: id.parse().map_err(|_| NotAnIdentity)?,
            started: started.parse().map_err(|_| NotAnIdentity)?,
        })
    }
}

/// When the process behind `process` started.
fn started(process: HANDLE) -> io::Result<u64> {
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: the handle is open for the length of the call, and each pointer is to a FILETIME
    // that lives on this stack.
    unsafe {
        GetProcessTimes(
            process,
            &raw mut created,
            &raw mut exited,
            &raw mut kernel,
            &raw mut user,
        )
    }
    .map_err(io::Error::from)?;
    Ok(u64::from(created.dwHighDateTime) << 32 | u64::from(created.dwLowDateTime))
}

/// A process, opened so it can be waited for. It may have ended already: Windows keeps an ended
/// process while anything still has a handle to it.
struct Opened {
    handle: OwnedHandle,
    started: u64,
}

impl Opened {
    /// Opens the process with this id, if there is one and it lets itself be waited for.
    fn open(id: u32) -> Option<Self> {
        // SAFETY: a plain request for a handle; on success it is owned by `OwnedHandle` below, which
        // closes it once.
        let raw = unsafe {
            OpenProcess(
                PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
                false,
                id,
            )
        }
        .ok()?;
        // SAFETY: `raw` was just opened, is valid, and nothing else owns it.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw.0) };
        let started = started(HANDLE(handle.as_raw_handle())).ok()?;
        Some(Self { handle, started })
    }

    /// Waits for the process to end, for at most `timeout`. Returns whether it ended.
    fn wait(&self, timeout: Duration) -> bool {
        let milliseconds = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX - 1);
        // SAFETY: the handle is open until `self` is dropped, and it allows waiting.
        let waited =
            unsafe { WaitForSingleObject(HANDLE(self.handle.as_raw_handle()), milliseconds) };
        waited != WAIT_TIMEOUT
    }

    fn has_ended(&self) -> bool {
        self.wait(Duration::ZERO)
    }
}

/// Every running process, by the id of the process that started it.
fn children_by_parent() -> HashMap<u32, Vec<u32>> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    // SAFETY: a plain request for a list of the processes; the handle is closed below.
    let Ok(snapshot) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else {
        return children;
    };
    let mut entry = PROCESSENTRY32W {
        dwSize: u32::try_from(size_of::<PROCESSENTRY32W>()).unwrap_or(u32::MAX),
        ..PROCESSENTRY32W::default()
    };
    // SAFETY: the snapshot is open, and `entry` is a PROCESSENTRY32W whose size field is set, as
    // these calls need.
    let mut more = unsafe { Process32FirstW(snapshot, &raw mut entry) }.is_ok();
    while more {
        children
            .entry(entry.th32ParentProcessID)
            .or_default()
            .push(entry.th32ProcessID);
        // SAFETY: as above.
        more = unsafe { Process32NextW(snapshot, &raw mut entry) }.is_ok();
    }
    // SAFETY: the snapshot was opened above and is closed once, here.
    let _ = unsafe { CloseHandle(snapshot) };
    children
}

/// The processes of a tree that run now: the root itself, what it started, what those started, and
/// so on. `known` holds every member found so far, and gains the new ones:
/// a member that has ended is still looked through, because what it started is linked to the root
/// in no other way. A process's record of who started it is only a number, so a process counts as
/// started by another only if it started after it. The process that asks is never part of the tree.
fn running_tree(root: Identity, known: &mut Vec<Identity>) -> Vec<Opened> {
    let children = children_by_parent();
    let me = std::process::id();
    let mut running = Vec::new();
    if root.id != me
        && let Some(process) =
            Opened::open(root.id).filter(|process| process.started == root.started)
        && !process.has_ended()
    {
        running.push(process);
    }
    let mut visited = vec![root.id];
    let mut parents = known.clone();
    while let Some(parent) = parents.pop() {
        for &id in children.get(&parent.id).into_iter().flatten() {
            if id == me || visited.contains(&id) {
                continue;
            }
            visited.push(id);
            let Some(process) = Opened::open(id).filter(|child| child.started >= parent.started)
            else {
                continue;
            };
            let member = Identity {
                id,
                started: process.started,
            };
            if !known.contains(&member) {
                known.push(member);
            }
            parents.push(member);
            if !process.has_ended() {
                running.push(process);
            }
        }
    }
    running
}

/// Waits until `root` and every process it started have ended, or until `timeout` has passed.
/// Returns whether they all ended. The process that waits is never waited for, nor what it started.
#[must_use]
pub fn wait_for_tree(root: Identity, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let mut known = vec![root];
    loop {
        let running = running_tree(root, &mut known);
        if running.is_empty() {
            return true;
        }
        for process in &running {
            if !process.wait(deadline.saturating_duration_since(Instant::now())) {
                return false;
            }
        }
        // All of those ended. Look again, for anything they started meanwhile.
    }
}
