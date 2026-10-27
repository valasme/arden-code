//! Processes: telling one apart from a later one that gets the same number, and waiting for one and
//! everything it started to end. Linux keeps both in `/proc`.

use std::collections::HashMap;
use std::fmt;
use std::io;
use std::process::Child;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant};

/// How often the processes of a tree are looked at while waiting for them. Linux has no handle a
/// process outside the parent can wait on, so they are looked at again until they are gone.
const POLL: Duration = Duration::from_millis(25);

/// A process: its number, and when it started. Linux gives a number to a new process once the old
/// one with it has ended, so the number alone can mean another process later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Identity {
    /// The process id.
    pub id: u32,
    /// When it started, in clock ticks since the computer started.
    started: u64,
}

/// What `/proc/<id>/stat` says about one process.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Stat {
    parent: u32,
    started: u64,
    /// Ended, and waiting for its parent to collect it.
    ended: bool,
}

/// Reads the fields of `/proc/<id>/stat` that matter here. The name of the program comes second,
/// in parentheses, and may hold spaces and parentheses itself, so the fields are read after the
/// last closing one.
fn parse_stat(text: &str) -> Option<Stat> {
    let (_, rest) = text.rsplit_once(')')?;
    let fields: Vec<&str> = rest.split_whitespace().collect();
    // After the name: state (3), parent (4), ... start time (22).
    Some(Stat {
        ended: matches!(*fields.first()?, "Z" | "X"),
        parent: fields.get(1)?.parse().ok()?,
        started: fields.get(19)?.parse().ok()?,
    })
}

fn stat_of(id: u32) -> Option<Stat> {
    parse_stat(&std::fs::read_to_string(format!("/proc/{id}/stat")).ok()?)
}

impl Identity {
    /// The identity of this process.
    ///
    /// # Errors
    ///
    /// Returns an error when Linux does not say when it started.
    pub fn current() -> io::Result<Self> {
        Self::of_id(std::process::id())
    }

    /// The identity of a process this one started.
    ///
    /// # Errors
    ///
    /// Returns an error when Linux does not say when it started.
    pub fn of(child: &Child) -> io::Result<Self> {
        Self::of_id(child.id())
    }

    fn of_id(id: u32) -> io::Result<Self> {
        let stat = stat_of(id).ok_or_else(|| io::Error::other("the process has no record"))?;
        Ok(Self {
            id,
            started: stat.started,
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

/// Every process there is, by its id.
fn every_process() -> HashMap<u32, Stat> {
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return HashMap::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().to_str()?.parse::<u32>().ok())
        .filter_map(|id| Some((id, stat_of(id)?)))
        .collect()
}

/// The members of a tree that run now, the first of `known` being its root: the root itself, what it started, what those started, and
/// so on, as `processes` lists them. `known` holds every member found so far, and gains the new
/// ones. Linux hands what an ended process started to another parent, so a member is linked to the
/// root only while its parent runs; `known` keeps the ones that were found while they were. A
/// process counts as started by another only if it started after it. `me`, the process that asks,
/// is never part of the tree.
fn running_tree(
    known: &mut Vec<Identity>,
    processes: &HashMap<u32, Stat>,
    me: u32,
) -> Vec<Identity> {
    let mut parents = known.clone();
    let mut visited: Vec<u32> = known.iter().map(|member| member.id).collect();
    while let Some(parent) = parents.pop() {
        for (&id, stat) in processes {
            if stat.parent != parent.id
                || id == me
                || visited.contains(&id)
                || stat.started < parent.started
            {
                continue;
            }
            visited.push(id);
            let member = Identity {
                id,
                started: stat.started,
            };
            known.push(member);
            parents.push(member);
        }
    }
    known
        .iter()
        .copied()
        .filter(|member| member.id != me)
        .filter(|member| {
            processes
                .get(&member.id)
                .is_some_and(|stat| stat.started == member.started && !stat.ended)
        })
        .collect()
}

/// Waits until `root` and every process it started have ended, or until `timeout` has passed.
/// Returns whether they all ended. The process that waits is never waited for, nor what it started.
#[must_use]
pub fn wait_for_tree(root: Identity, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let me = std::process::id();
    let mut known = vec![root];
    loop {
        if running_tree(&mut known, &every_process(), me).is_empty() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stat(parent: u32, started: u64) -> Stat {
        Stat {
            parent,
            started,
            ended: false,
        }
    }

    fn identity(id: u32, started: u64) -> Identity {
        Identity { id, started }
    }

    #[test]
    fn the_fields_are_read_after_a_program_name_with_spaces_and_parentheses() {
        let text = "4242 (Web (Content) Process) S 4000 4242 4000 0 -1 4194560 1 0 0 0 0 0 0 0 \
                    20 0 1 0 987654 0 0";

        assert_eq!(
            parse_stat(text),
            Some(Stat {
                parent: 4000,
                started: 987_654,
                ended: false
            })
        );
    }

    #[test]
    fn a_process_waiting_to_be_collected_has_ended() {
        let text = "7 (sleep) Z 1 7 7 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 55 0 0";

        assert!(parse_stat(text).expect("a stat").ended);
    }

    #[test]
    fn an_identity_is_written_and_read_back() {
        let written = identity(1234, 98_765).to_string();

        assert_eq!(written, "1234:98765");
        assert_eq!(written.parse::<Identity>(), Ok(identity(1234, 98_765)));
        assert_eq!("1234".parse::<Identity>(), Err(NotAnIdentity));
        assert_eq!("a:b".parse::<Identity>(), Err(NotAnIdentity));
    }

    #[test]
    fn the_tree_is_the_root_and_what_it_started_and_what_those_started() {
        let processes = HashMap::from([
            (10, stat(1, 100)),
            (11, stat(10, 110)),
            (12, stat(11, 120)),
            (20, stat(1, 105)),
        ]);
        let mut known = vec![identity(10, 100)];

        let mut running: Vec<u32> = running_tree(&mut known, &processes, 99)
            .iter()
            .map(|member| member.id)
            .collect();
        running.sort_unstable();

        assert_eq!(running, [10, 11, 12]);
    }

    #[test]
    fn a_member_found_while_its_parent_ran_is_still_waited_for_once_linux_handed_it_on() {
        let root = identity(10, 100);
        let mut known = vec![root];
        let before = HashMap::from([(10, stat(1, 100)), (11, stat(10, 110))]);
        running_tree(&mut known, &before, 99);

        // The root ended, and its child now belongs to the first process.
        let after = HashMap::from([(11, stat(1, 110))]);

        assert_eq!(running_tree(&mut known, &after, 99), [identity(11, 110)]);
    }

    #[test]
    fn a_process_that_got_an_old_number_is_not_the_one_that_had_it() {
        let root = identity(10, 100);
        let processes = HashMap::from([(10, stat(1, 500)), (11, stat(10, 90))]);

        assert!(running_tree(&mut vec![root], &processes, 99).is_empty());
    }

    #[test]
    fn the_process_that_waits_is_never_part_of_the_tree() {
        let root = identity(10, 100);
        let processes = HashMap::from([(10, stat(1, 100)), (99, stat(10, 150))]);

        assert_eq!(running_tree(&mut vec![root], &processes, 99), [root]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn waiting_for_a_tree_ends_once_the_program_and_what_it_started_have_ended() {
        let mut shell = std::process::Command::new("/bin/sh")
            .args(["-c", "sleep 0.3 & sleep 0.1; wait"])
            .spawn()
            .expect("a shell");
        let root = Identity::of(&shell).expect("an identity");
        let started = Instant::now();

        let collector = thread::spawn(move || shell.wait());
        assert!(wait_for_tree(root, Duration::from_secs(10)));

        assert!(started.elapsed() >= Duration::from_millis(250));
        let _ = collector.join();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn waiting_for_a_tree_gives_up_after_the_timeout() {
        let mut sleep = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("sleep");
        let root = Identity::of(&sleep).expect("an identity");

        assert!(!wait_for_tree(root, Duration::from_millis(200)));
        let _ = sleep.kill();
        let _ = sleep.wait();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn this_process_has_an_identity_of_its_own() {
        let me = Identity::current().expect("an identity");

        assert_eq!(me.id, std::process::id());
        assert_eq!(me.to_string().parse::<Identity>(), Ok(me));
    }
}
