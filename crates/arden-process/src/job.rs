//! The job: every program Arden Code starts is in it, and ends with the app.
//!
//! On Windows it is a Job Object. When the last handle to the job closes, which happens when Arden
//! Code ends, whether it closed normally, crashed, or was ended from Task Manager, Windows ends
//! every process in it. So no agent is left running with nobody watching it.
//!
//! Linux has nothing that does all of that (ADR 0058). Each program starts as the leader of a
//! process group of its own, so what it starts is in the group too, and the kernel kills it with
//! `SIGKILL` the moment the app ends, however it ends (`PR_SET_PDEATHSIG`). That signal follows the
//! thread that started the program, so every program is started from one thread that lives as
//! long as the job. When the job ends, normally or when the app is told to stop, the whole of each
//! group is killed. What a program started is killed with the app too, except when the app itself
//! is killed with `SIGKILL`, or when it left its group on purpose.

use std::io;
use std::process::{Child, Command};

/// A job whose processes end when it is dropped.
#[derive(Debug)]
pub struct Job {
    #[cfg(windows)]
    handle: windows::Win32::Foundation::HANDLE,
    #[cfg(target_os = "linux")]
    groups: linux::Groups,
}

// SAFETY: a job handle is a plain number that Windows accepts from any thread, and the job is only
// closed once, when this value is dropped.
#[cfg(windows)]
#[allow(unsafe_code)]
unsafe impl Send for Job {}
// SAFETY: as above; nothing here changes through a shared reference.
#[cfg(windows)]
#[allow(unsafe_code)]
unsafe impl Sync for Job {}

#[cfg(windows)]
impl Job {
    /// Makes a job that ends its processes when it is closed.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows refuses to make the job.
    #[allow(unsafe_code)]
    pub fn new() -> io::Result<Self> {
        use std::ffi::c_void;
        use std::mem::size_of;

        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::JobObjects::{
            CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };

        // SAFETY: these are plain Win32 calls. The arguments are valid for the length of each
        // call, and the handle is closed on the error path and otherwise by `Drop`.
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(io::Error::from)?;
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast::<c_void>(),
                u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
                    .map_err(|_| io::Error::other("the limits are too large"))?,
            );
            if let Err(error) = set {
                let _ = CloseHandle(handle);
                return Err(io::Error::from(error));
            }
            Ok(Self { handle })
        }
    }

    /// Starts a program and puts it in the job, from now on and with everything it starts. A
    /// program that cannot be put in the job is ended: it would outlive the app.
    ///
    /// # Errors
    ///
    /// Returns an error when the program cannot be started or cannot be put in the job.
    pub fn start(&self, mut command: Command) -> io::Result<Child> {
        let mut child = command.spawn()?;
        if let Err(error) = self.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(io::Error::other(format!(
                "the program could not be put in the job: {error}"
            )));
        }
        Ok(child)
    }

    /// Ends every program in the job now. Windows does it when the app's process ends, however it
    /// ends, so there is nothing to do before.
    #[allow(clippy::unused_self)]
    pub fn end(&self) {}

    /// Puts a process in the job, from now on and with everything it starts.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows refuses, for instance when the process already ended.
    #[allow(unsafe_code)]
    fn assign(&self, child: &Child) -> io::Result<()> {
        use std::os::windows::io::AsRawHandle;

        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::System::JobObjects::AssignProcessToJobObject;

        // SAFETY: the job handle is open until `self` is dropped, and the process handle stays
        // open for as long as `child` exists, which outlives this call.
        unsafe {
            AssignProcessToJobObject(self.handle, HANDLE(child.as_raw_handle()))
                .map_err(io::Error::from)
        }
    }
}

#[cfg(windows)]
impl Drop for Job {
    #[allow(unsafe_code)]
    fn drop(&mut self) {
        use windows::Win32::Foundation::CloseHandle;

        // SAFETY: the handle was made by `new` and is closed only here. Closing it is what ends
        // the processes in the job.
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

#[cfg(target_os = "linux")]
impl Job {
    /// Makes a job, with the thread that starts its programs.
    ///
    /// # Errors
    ///
    /// Returns an error when the thread cannot be started.
    pub fn new() -> io::Result<Self> {
        Ok(Self {
            groups: linux::Groups::new()?,
        })
    }

    /// Starts a program as the leader of a process group of its own, which the kernel kills when
    /// the app ends, from the job's own thread.
    ///
    /// # Errors
    ///
    /// Returns an error when the program cannot be started.
    pub fn start(&self, command: Command) -> io::Result<Child> {
        self.groups.start(command)
    }

    /// Kills every program in the job now, with everything each one started that stayed in its
    /// group.
    pub fn end(&self) {
        self.groups.end();
    }
}

#[cfg(target_os = "linux")]
impl Drop for Job {
    fn drop(&mut self) {
        self.groups.end();
    }
}

/// Neither Windows nor Linux: the job only starts programs, and nothing ends them with the app.
#[cfg(not(any(windows, target_os = "linux")))]
impl Job {
    /// Makes a job that only starts programs.
    ///
    /// # Errors
    ///
    /// Never.
    #[allow(clippy::unnecessary_wraps)]
    pub fn new() -> io::Result<Self> {
        Ok(Self {})
    }

    /// Starts a program.
    ///
    /// # Errors
    ///
    /// Returns an error when the program cannot be started.
    #[allow(clippy::unused_self)]
    pub fn start(&self, mut command: Command) -> io::Result<Child> {
        command.spawn()
    }

    /// Does nothing.
    #[allow(clippy::unused_self)]
    pub fn end(&self) {}
}

#[cfg(target_os = "linux")]
mod linux {
    use std::fmt;
    use std::io;
    use std::os::unix::process::CommandExt;
    use std::process::{Child, Command};
    use std::sync::mpsc::{self, Sender};
    use std::sync::{Mutex, PoisonError};
    use std::thread;

    /// A program to start, and where to send it once it has started.
    type Request = (Command, Sender<io::Result<Child>>);

    /// The process groups of the programs the job started, and the thread that starts them.
    pub struct Groups {
        /// The way to the thread that starts the programs. It ends when this is dropped.
        starter: Mutex<Option<Sender<Request>>>,
        /// The id of each group, which is the id of the program that leads it.
        ids: Mutex<Vec<i32>>,
    }

    impl fmt::Debug for Groups {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter
                .debug_struct("Groups")
                .field("ids", &self.ids)
                .finish_non_exhaustive()
        }
    }

    impl Groups {
        /// Starts the thread that starts the programs.
        pub fn new() -> io::Result<Self> {
            let (send, receive) = mpsc::channel::<Request>();
            thread::Builder::new()
                .name("arden-job".to_owned())
                .spawn(move || {
                    // The kernel kills each program when this thread ends, which is when the job
                    // ends or the app does.
                    for (mut command, reply) in receive {
                        let _ = reply.send(spawn(&mut command));
                    }
                })?;
            Ok(Self {
                starter: Mutex::new(Some(send)),
                ids: Mutex::new(Vec::new()),
            })
        }

        /// Starts a program in a group of its own, from the job's thread.
        pub fn start(&self, mut command: Command) -> io::Result<Child> {
            let parent = std::process::id();
            command.process_group(0);
            // SAFETY: the function runs in the new process between `fork` and `exec`, where only
            // calls that are safe in a signal handler may be made. `prctl` and `getppid` are such
            // calls, and the function touches no memory but its own copy of `parent`.
            #[allow(unsafe_code)]
            unsafe {
                command.pre_exec(move || die_with_parent(parent));
            }
            let (reply, answer) = mpsc::channel();
            let sent = self
                .starter
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .as_ref()
                .is_some_and(|starter| starter.send((command, reply)).is_ok());
            if !sent {
                return Err(io::Error::other("the job has ended"));
            }
            let child = answer
                .recv()
                .map_err(|_| io::Error::other("the job has ended"))??;
            let mut ids = self.ids.lock().unwrap_or_else(PoisonError::into_inner);
            ids.retain(|&id| group_exists(id));
            if let Ok(id) = i32::try_from(child.id()) {
                ids.push(id);
            }
            Ok(child)
        }

        /// Kills every group, and starts no more programs.
        pub fn end(&self) {
            let ids = std::mem::take(&mut *self.ids.lock().unwrap_or_else(PoisonError::into_inner));
            for id in ids {
                kill_group(id);
            }
        }
    }

    impl Drop for Groups {
        fn drop(&mut self) {
            // The thread ends once nothing can send to it.
            self.starter
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .take();
        }
    }

    /// How many times a program whose file is still open for writing is tried again.
    const BUSY_TRIES: u32 = 10;

    /// Starts a program. Linux refuses to run a file that some process still has open for writing
    /// ("text file busy"), which happens for a moment after a program was copied or updated, when
    /// another program was being started at the same time and held the file open until its own
    /// start. So such a refusal is tried again, a little later.
    fn spawn(command: &mut Command) -> io::Result<Child> {
        let mut tries = 1;
        loop {
            match command.spawn() {
                Err(error) if error.raw_os_error() == Some(libc::ETXTBSY) && tries < BUSY_TRIES => {
                    tries += 1;
                    thread::sleep(std::time::Duration::from_millis(20));
                }
                result => return result,
            }
        }
    }

    /// Asks the kernel to kill this process when the thread that started it ends, and ends it now
    /// if the app ended already, before the request was made.
    fn die_with_parent(parent: u32) -> io::Result<()> {
        // SAFETY: plain system calls, safe between `fork` and `exec`. `prctl` reads no memory.
        #[allow(unsafe_code)]
        unsafe {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL, 0, 0, 0) != 0 {
                return Err(io::Error::last_os_error());
            }
            if u32::try_from(libc::getppid()).ok() != Some(parent) {
                return Err(io::Error::other("the app has ended"));
            }
        }
        Ok(())
    }

    /// Whether a process group still has a process in it.
    fn group_exists(id: i32) -> bool {
        // SAFETY: signal 0 is only a check; nothing is sent.
        #[allow(unsafe_code)]
        let result = unsafe { libc::kill(-id, 0) };
        result == 0 || io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
    }

    /// Kills every process in a group.
    fn kill_group(id: i32) {
        if id <= 1 {
            return;
        }
        // SAFETY: a plain system call with plain numbers.
        #[allow(unsafe_code)]
        unsafe {
            libc::kill(-id, libc::SIGKILL);
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use std::fs;
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    use super::*;

    /// The variable that makes [`helper_that_starts_a_program_and_waits`] do its work.
    const HELPER_FILE: &str = "ARDEN_JOB_HELPER_FILE";

    /// Whether a process runs: it exists and has not ended. An ended one may wait as a zombie for
    /// whoever has to collect it.
    fn runs(pid: u32) -> bool {
        fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|stat| {
            stat.rsplit_once(')')
                .and_then(|(_, rest)| rest.split_whitespace().next())
                .is_some_and(|state| state != "Z" && state != "X")
        })
    }

    /// Waits for a process to end, for at most a few seconds. Returns whether it did.
    fn ends(pid: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if !runs(pid) {
                return true;
            }
            thread::sleep(Duration::from_millis(20));
        }
        false
    }

    /// Waits for a file to hold a number, and returns it.
    fn number_in(file: &Path) -> u32 {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(number) = fs::read_to_string(file)
                .ok()
                .and_then(|text| text.trim().parse().ok())
            {
                return number;
            }
            assert!(
                Instant::now() < deadline,
                "nothing was written to {}",
                file.display()
            );
            thread::sleep(Duration::from_millis(20));
        }
    }

    /// A shell that starts a `sleep` of its own, writes that one's number to `file`, and waits.
    fn shell_with_a_program_of_its_own(file: &Path) -> Command {
        let mut command = Command::new("/bin/sh");
        command
            .arg("-c")
            .arg(format!("sleep 60 & echo $! > '{}'; wait", file.display()))
            .stdin(Stdio::null());
        command
    }

    #[test]
    fn a_program_and_what_it_started_end_when_the_job_does() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("pid");
        let job = Job::new().expect("a job");
        let mut shell = job
            .start(shell_with_a_program_of_its_own(&file))
            .expect("the shell starts");
        let started = number_in(&file);
        assert!(runs(started));

        drop(job);

        assert!(ends(started), "what the program started ended with it");
        let deadline = Instant::now() + Duration::from_secs(5);
        while shell.try_wait().expect("the state").is_none() {
            assert!(Instant::now() < deadline, "the program ended");
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn ending_the_job_ends_its_programs_and_the_job_starts_no_more_of_them_afterwards() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("pid");
        let job = Job::new().expect("a job");
        let mut shell = job
            .start(shell_with_a_program_of_its_own(&file))
            .expect("the shell starts");
        let started = number_in(&file);

        job.end();

        assert!(ends(started));
        let _ = shell.wait();
    }

    #[test]
    fn a_program_lives_on_when_the_thread_that_asked_for_it_ends() {
        let job = std::sync::Arc::new(Job::new().expect("a job"));
        let starter = std::sync::Arc::clone(&job);
        let mut sleep = thread::spawn(move || {
            let mut command = Command::new("sleep");
            command.arg("60");
            starter.start(command).expect("sleep starts")
        })
        .join()
        .expect("the thread ends");
        thread::sleep(Duration::from_millis(300));

        assert!(
            sleep.try_wait().expect("the state").is_none(),
            "the kernel signals when the thread that started a program ends, and the job's own \
             thread started this one"
        );
        let _ = sleep.kill();
        let _ = sleep.wait();
    }

    #[test]
    fn a_program_ends_when_the_app_is_killed() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let file = folder.path().join("pid");
        let mut app = Command::new(std::env::current_exe().expect("this test program"))
            .args([
                "--exact",
                "job::linux_tests::helper_that_starts_a_program_and_waits",
                "--ignored",
                "--nocapture",
            ])
            .env(HELPER_FILE, &file)
            .stdout(Stdio::null())
            .spawn()
            .expect("the stand-in for the app starts");
        let started = number_in(&file);
        assert!(runs(started));

        // SIGKILL: nothing in the app runs, no destructor and no handler.
        app.kill().expect("the stand-in is killed");
        let _ = app.wait();

        assert!(ends(started), "the kernel killed the program with the app");
    }

    /// Stands in for the app in [`a_program_ends_when_the_app_is_killed`]: starts a program in a
    /// job, says which one, and waits to be killed.
    #[test]
    #[ignore = "run by a_program_ends_when_the_app_is_killed"]
    fn helper_that_starts_a_program_and_waits() {
        let Some(file) = std::env::var_os(HELPER_FILE) else {
            return;
        };
        let job = Job::new().expect("a job");
        let mut command = Command::new("sleep");
        command.arg("60");
        let mut sleep = job.start(command).expect("sleep starts");
        fs::write(file, sleep.id().to_string()).expect("the number is written");
        // Killed long before this ends.
        let _ = sleep.wait();
    }
}
