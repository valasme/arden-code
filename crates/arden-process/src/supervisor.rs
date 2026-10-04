//! Starting programs, keeping them in the job, and giving each its own log.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Stdio};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::command::{self, Arg, SpawnError};
use crate::job::Job;
use crate::resolve::Resolved;

/// How much of a program's output [`Supervisor::run`] keeps in memory. The log has all of it.
const CAPTURE_LIMIT: usize = 64 * 1024;
/// How long to wait for a program's output to drain after it has ended.
const DRAIN_TIME: Duration = Duration::from_millis(500);

/// A program that was started.
#[derive(Debug)]
pub struct Started {
    pub child: Child,
    /// The file that holds everything the program wrote.
    pub log: PathBuf,
}

/// A program started with its input and output held by Arden Code, such as an agent that speaks a
/// protocol over them (ADR 0038).
#[derive(Debug)]
pub struct Piped {
    pub child: Child,
    /// What Arden Code writes to the program.
    pub input: ChildStdin,
    /// What the program writes back.
    pub output: ChildStdout,
    /// The file that holds what the program wrote as errors.
    pub log: PathBuf,
}

/// What a program did, when it was run to its end.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completed {
    /// The exit code, or nothing when the program was ended for taking too long.
    pub exit_code: Option<i32>,
    /// What it wrote, without the end when there was a great deal.
    pub output: String,
    pub timed_out: bool,
    pub log: PathBuf,
}

/// Starts programs for the app, all in one job so that they end when the app ends.
#[derive(Debug)]
pub struct Supervisor {
    job: Job,
    log_folder: PathBuf,
    sequence: AtomicU64,
}

/// A name that is safe in a file name.
fn file_safe(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "program".to_owned()
    } else {
        cleaned
    }
}

impl Supervisor {
    /// A supervisor that writes the logs of the programs it starts into `log_folder`.
    ///
    /// # Errors
    ///
    /// Returns an error when the job cannot be made.
    pub fn new(log_folder: impl Into<PathBuf>) -> io::Result<Self> {
        Ok(Self {
            job: Job::new()?,
            log_folder: log_folder.into(),
            sequence: AtomicU64::new(0),
        })
    }

    /// Makes the log file of a new program, with a line that says what was started. Text that
    /// came from a person or an agent is not written: it may be private.
    fn open_log(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
    ) -> io::Result<(File, PathBuf)> {
        fs::create_dir_all(&self.log_folder)?;
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs());
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let path = self
            .log_folder
            .join(format!("{}-{seconds}-{sequence}.log", file_safe(name)));
        let mut file = File::create_new(&path)?;
        let literal: Vec<&str> = args
            .iter()
            .filter_map(|arg| match arg {
                Arg::Literal(text) => Some(*text),
                Arg::Untrusted(_) => None,
            })
            .collect();
        let hidden = args.len() - literal.len();
        let program_name = program
            .path
            .file_name()
            .map_or_else(|| "program".into(), |file_name| file_name.to_string_lossy());
        writeln!(
            file,
            "# Arden Code started {program_name} with {} (and {hidden} argument(s) not written here)",
            literal.join(" ")
        )?;
        Ok((file, path))
    }

    /// Starts a program with its output going to a log of its own, and puts it in the job.
    ///
    /// # Errors
    ///
    /// Returns an error when the arguments are not allowed for this kind of program, or when the
    /// program cannot be started or cannot be put in the job (it is then ended).
    pub fn spawn(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
    ) -> Result<Started, SpawnError> {
        let mut command = command::build(program, args)?;
        let (log, path) = self
            .open_log(name, program, args)
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        let errors = log
            .try_clone()
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        command
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(errors));
        let mut child = command
            .spawn()
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        // A program that is not in the job would outlive the app. It is not allowed to exist.
        if let Err(error) = self.job.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(SpawnError::Io(format!(
                "the program could not be put in the job: {error}"
            )));
        }
        Ok(Started { child, log: path })
    }

    /// Starts a program whose input and output Arden Code holds, in `folder`, with the variables
    /// named in `without` left out of its environment, and puts it in the job. What it writes as
    /// errors goes to its log. What it writes on its output does not: for an agent, that is the
    /// conversation itself (ADR 0038).
    ///
    /// # Errors
    ///
    /// Returns an error when the arguments are not allowed for this kind of program, or when the
    /// program cannot be started or cannot be put in the job (it is then ended).
    pub fn spawn_piped(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
        folder: &Path,
        without: &[&str],
    ) -> Result<Piped, SpawnError> {
        let mut command = command::build(program, args)?;
        let (log, path) = self
            .open_log(name, program, args)
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        command
            .current_dir(folder)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log));
        for variable in without {
            command.env_remove(variable);
        }
        let mut child = command
            .spawn()
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        if let Err(error) = self.job.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(SpawnError::Io(format!(
                "the program could not be put in the job: {error}"
            )));
        }
        let (Some(input), Some(output)) = (child.stdin.take(), child.stdout.take()) else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(SpawnError::Io(
                "the program's input and output could not be opened".into(),
            ));
        };
        Ok(Piped {
            child,
            input,
            output,
            log: path,
        })
    }

    /// Runs a program until it ends or takes longer than `timeout`, and returns what it wrote.
    ///
    /// # Errors
    ///
    /// Returns an error when the program cannot be started, as [`Supervisor::spawn`] does.
    pub fn run(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
        timeout: Duration,
    ) -> Result<Completed, SpawnError> {
        self.run_with(name, program, args, timeout, true)
    }

    /// Runs a program as [`Supervisor::run`] does, but leaves what it wrote out of its log, which
    /// only says that it was withheld: for a program whose answer can hold private details, such
    /// as the email of the account an agent is signed in to.
    ///
    /// # Errors
    ///
    /// Returns an error when the program cannot be started, as [`Supervisor::spawn`] does.
    pub fn run_private(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
        timeout: Duration,
    ) -> Result<Completed, SpawnError> {
        self.run_with(name, program, args, timeout, false)
    }

    fn run_with(
        &self,
        name: &str,
        program: &Resolved,
        args: &[Arg],
        timeout: Duration,
        logged: bool,
    ) -> Result<Completed, SpawnError> {
        let mut command = command::build(program, args)?;
        let (mut log, path) = self
            .open_log(name, program, args)
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        if !logged {
            let _ = writeln!(log, "(what the program writes is not kept here)");
        }
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| SpawnError::Io(error.to_string()))?;
        if let Err(error) = self.job.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(SpawnError::Io(format!(
                "the program could not be put in the job: {error}"
            )));
        }

        let log = logged.then(|| Arc::new(Mutex::new(log)));
        let captured = Arc::new(Mutex::new(Vec::<u8>::new()));
        let readers = Arc::new(AtomicUsize::new(0));
        if let Some(stream) = child.stdout.take() {
            copy_in_background(stream, log.as_ref(), &captured, &readers);
        }
        if let Some(stream) = child.stderr.take() {
            copy_in_background(stream, log.as_ref(), &captured, &readers);
        }

        let started = Instant::now();
        let mut timed_out = false;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) if started.elapsed() >= timeout => {
                    timed_out = true;
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                Ok(None) => thread::sleep(Duration::from_millis(10)),
                Err(error) => return Err(SpawnError::Io(error.to_string())),
            }
        };
        // What a program that has ended still has in its pipes arrives a moment later. A program
        // it started may still hold them open, so this does not wait for ever.
        let drain_started = Instant::now();
        while readers.load(Ordering::Acquire) > 0 && drain_started.elapsed() < DRAIN_TIME {
            thread::sleep(Duration::from_millis(5));
        }

        let output =
            String::from_utf8_lossy(&captured.lock().unwrap_or_else(PoisonError::into_inner))
                .into_owned();
        Ok(Completed {
            exit_code: status.and_then(|status| status.code()),
            output,
            timed_out,
            log: path,
        })
    }

    /// The folder the logs of the programs go to.
    #[must_use]
    pub fn log_folder(&self) -> &Path {
        &self.log_folder
    }
}

/// Copies everything a stream produces to the log and to a buffer, on a thread of its own.
fn copy_in_background(
    mut stream: impl Read + Send + 'static,
    log: Option<&Arc<Mutex<File>>>,
    captured: &Arc<Mutex<Vec<u8>>>,
    readers: &Arc<AtomicUsize>,
) {
    let log = log.map(Arc::clone);
    let captured = Arc::clone(captured);
    let readers = Arc::clone(readers);
    readers.fetch_add(1, Ordering::AcqRel);
    thread::spawn(move || {
        let mut chunk = [0_u8; 4096];
        while let Ok(count) = stream.read(&mut chunk) {
            if count == 0 {
                break;
            }
            let bytes = &chunk[..count];
            if let Some(log) = &log {
                let _ = log
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .write_all(bytes);
            }
            let mut kept = captured.lock().unwrap_or_else(PoisonError::into_inner);
            let room = CAPTURE_LIMIT.saturating_sub(kept.len());
            kept.extend_from_slice(&bytes[..count.min(room)]);
        }
        readers.fetch_sub(1, Ordering::AcqRel);
    });
}

#[cfg(all(test, windows))]
mod tests {
    use std::ffi::OsStr;
    use std::fs;

    use super::*;
    use crate::resolve::{ProgramKind, resolve, resolve_from_environment};

    fn system(name: &str) -> Resolved {
        resolve_from_environment(name).unwrap_or_else(|| panic!("{name} is part of Windows"))
    }

    fn supervisor() -> (Supervisor, tempfile::TempDir) {
        let logs = tempfile::tempdir().expect("a temporary folder");
        (
            Supervisor::new(logs.path().join("agents")).expect("a supervisor"),
            logs,
        )
    }

    /// A program that runs for a minute unless something ends it.
    fn long_running() -> (Resolved, Vec<Arg>) {
        (
            system("ping"),
            vec![
                Arg::Literal("-n"),
                Arg::Literal("60"),
                Arg::Literal("127.0.0.1"),
            ],
        )
    }

    #[test]
    fn a_private_run_returns_what_the_program_wrote_and_keeps_it_out_of_the_log() {
        let (supervisor, _logs) = supervisor();

        let done = supervisor
            .run_private(
                "cmd",
                &system("cmd"),
                &[
                    Arg::Literal("/c"),
                    Arg::Untrusted("echo ada@example.com".into()),
                ],
                Duration::from_secs(20),
            )
            .expect("the program runs");

        assert!(done.output.contains("ada@example.com"), "{}", done.output);
        let log = fs::read_to_string(&done.log).expect("the log");
        assert!(!log.contains("ada@example.com"), "{log}");
        assert!(log.contains("not kept here"), "{log}");
    }

    #[test]
    fn runs_a_program_and_returns_what_it_wrote() {
        let (supervisor, _logs) = supervisor();

        let done = supervisor
            .run(
                "cmd",
                &system("cmd"),
                &[
                    Arg::Literal("/c"),
                    Arg::Untrusted("echo hello from a child".into()),
                ],
                Duration::from_secs(20),
            )
            .expect("the program runs");

        assert_eq!(done.exit_code, Some(0));
        assert!(!done.timed_out);
        assert!(
            done.output.contains("hello from a child"),
            "{}",
            done.output
        );
    }

    #[test]
    fn everything_a_program_writes_goes_to_a_log_of_its_own() {
        let (supervisor, _logs) = supervisor();
        let cmd = system("cmd");
        let say = |text: &str| {
            supervisor
                .run(
                    "Claude Code",
                    &cmd,
                    &[Arg::Literal("/c"), Arg::Untrusted(format!("echo {text}"))],
                    Duration::from_secs(20),
                )
                .expect("the program runs")
        };

        let first = say("first words");
        let second = say("second words");

        assert_ne!(first.log, second.log);
        assert!(first.log.starts_with(supervisor.log_folder()));
        let name = first.log.file_name().expect("a file").to_string_lossy();
        assert!(
            name.starts_with("claude-code-") && name.ends_with(".log"),
            "{name}"
        );
        let text = fs::read_to_string(&first.log).expect("the log");
        assert!(text.contains("first words") && !text.contains("second words"));
        assert!(text.starts_with("# Arden Code started cmd.exe"), "{text}");
        // What a person typed is not written into the log's first line.
        assert!(
            !text
                .lines()
                .next()
                .unwrap_or_default()
                .contains("first words")
        );
    }

    #[test]
    fn a_program_that_takes_too_long_is_ended() {
        let (supervisor, _logs) = supervisor();
        let (ping, args) = long_running();
        let started = Instant::now();

        let done = supervisor
            .run("ping", &ping, &args, Duration::from_millis(300))
            .expect("the program starts");

        assert!(done.timed_out);
        assert_eq!(done.exit_code, None);
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn a_program_in_the_job_ends_when_the_supervisor_is_closed() {
        let (supervisor, _logs) = supervisor();
        let (ping, args) = long_running();
        let mut started = supervisor
            .spawn("ping", &ping, &args)
            .expect("the program starts");
        thread::sleep(Duration::from_millis(300));
        assert!(
            started.child.try_wait().expect("the state").is_none(),
            "the program is running"
        );

        // This is what happens when Arden Code ends, however it ends: its handle to the job closes.
        drop(supervisor);

        let deadline = Instant::now() + Duration::from_secs(10);
        let mut ended = false;
        while Instant::now() < deadline {
            if started.child.try_wait().expect("the state").is_some() {
                ended = true;
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        assert!(ended, "Windows ended the program with the job");
    }

    /// Everything a piped program writes, once it has ended.
    fn everything_written(piped: Piped) -> String {
        let Piped {
            mut child,
            input,
            mut output,
            ..
        } = piped;
        drop(input);
        let mut text = String::new();
        output.read_to_string(&mut text).expect("its output");
        child.wait().expect("it ends");
        text
    }

    #[test]
    fn a_piped_program_reads_what_arden_code_writes_and_answers_on_its_output() {
        let (supervisor, _logs) = supervisor();
        let folder = tempfile::tempdir().expect("a temporary folder");
        let mut piped = supervisor
            .spawn_piped("sort", &system("sort"), &[], folder.path(), &[])
            .expect("the program starts");

        piped
            .input
            .write_all(b"pear\r\napple\r\n")
            .expect("it reads");

        assert_eq!(everything_written(piped), "apple\r\npear\r\n");
    }

    #[test]
    fn a_piped_program_runs_in_the_folder_it_was_given_without_the_variables_left_out() {
        let (supervisor, _logs) = supervisor();
        let folder = tempfile::tempdir().expect("a temporary folder");
        let piped = supervisor
            .spawn_piped(
                "cmd",
                &system("cmd"),
                &[Arg::Literal("/c"), Arg::Literal("cd & echo %OS%")],
                folder.path(),
                &["OS"],
            )
            .expect("the program starts");

        let written = everything_written(piped);
        let lines: Vec<&str> = written.lines().collect();

        assert_eq!(
            fs::canonicalize(lines[0]).expect("a folder"),
            fs::canonicalize(folder.path()).expect("a folder")
        );
        assert_eq!(lines[1], "%OS%", "the variable was left out");
    }

    #[test]
    fn what_a_piped_program_writes_as_errors_goes_to_its_log() {
        let (supervisor, _logs) = supervisor();
        let folder = tempfile::tempdir().expect("a temporary folder");
        let piped = supervisor
            .spawn_piped(
                "cmd",
                &system("cmd"),
                &[Arg::Literal("/c"), Arg::Literal("echo trouble 1>&2")],
                folder.path(),
                &[],
            )
            .expect("the program starts");
        let log = piped.log.clone();

        assert_eq!(
            everything_written(piped),
            "",
            "errors are not on its output"
        );
        let text = fs::read_to_string(log).expect("the log");
        assert!(text.starts_with("# Arden Code started cmd.exe"), "{text}");
        assert!(text.contains("trouble"), "{text}");
    }

    #[test]
    fn a_piped_program_ends_when_the_supervisor_is_closed() {
        let (supervisor, _logs) = supervisor();
        let folder = tempfile::tempdir().expect("a temporary folder");
        let (ping, args) = long_running();
        let mut piped = supervisor
            .spawn_piped("ping", &ping, &args, folder.path(), &[])
            .expect("the program starts");

        drop(supervisor);

        let deadline = Instant::now() + Duration::from_secs(10);
        while piped.child.try_wait().expect("the state").is_none() {
            assert!(
                Instant::now() < deadline,
                "Windows ended the program with the job"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    #[test]
    fn a_piped_script_never_gets_untrusted_text() {
        let (supervisor, _logs) = supervisor();
        let bin = tempfile::tempdir().expect("a temporary folder");
        fs::write(bin.path().join("claude.cmd"), "@echo off\r\necho %*\r\n").expect("a script");
        let script = Resolved {
            path: bin.path().join("claude.cmd"),
            kind: ProgramKind::Script,
        };

        let refused = supervisor.spawn_piped(
            "claude",
            &script,
            &[Arg::Untrusted("& calc.exe".into())],
            bin.path(),
            &[],
        );

        assert!(matches!(refused, Err(SpawnError::UnsafeArguments)));
    }

    #[test]
    fn a_program_started_by_a_program_in_the_job_ends_with_it_too() {
        let (supervisor, _logs) = supervisor();
        // cmd starts ping, which is a program of its own.
        let mut started = supervisor
            .spawn(
                "cmd",
                &system("cmd"),
                &[Arg::Literal("/c"), Arg::Literal("ping -n 60 127.0.0.1")],
            )
            .expect("the program starts");
        thread::sleep(Duration::from_millis(500));

        drop(supervisor);

        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline && started.child.try_wait().expect("the state").is_none() {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(started.child.try_wait().expect("the state").is_some());
    }

    #[test]
    fn a_script_runs_with_arguments_arden_code_wrote_and_never_with_others() {
        let bin = tempfile::tempdir().expect("a temporary folder");
        fs::write(
            bin.path().join("codex.cmd"),
            "@echo off\r\necho codex-cli 9.9.9\r\n",
        )
        .expect("a script");
        let script = resolve(
            "codex",
            OsStr::new(&bin.path().display().to_string()),
            OsStr::new(".CMD"),
        )
        .expect("the script");
        assert_eq!(script.kind, ProgramKind::Script);
        let (supervisor, _logs) = supervisor();

        let done = supervisor
            .run(
                "codex",
                &script,
                &[Arg::Literal("--version")],
                Duration::from_secs(20),
            )
            .expect("the script runs");
        let refused = supervisor.run(
            "codex",
            &script,
            &[Arg::Untrusted("& calc.exe".into())],
            Duration::from_secs(20),
        );

        assert!(done.output.contains("codex-cli 9.9.9"), "{}", done.output);
        assert_eq!(refused.err(), Some(SpawnError::UnsafeArguments));
        // Nothing was started for the refused one, so it has no log.
        let logs = fs::read_dir(supervisor.log_folder())
            .expect("the folder")
            .count();
        assert_eq!(logs, 1);
    }

    #[test]
    fn a_program_that_does_not_exist_cannot_be_started() {
        let (supervisor, _logs) = supervisor();
        let missing = Resolved {
            path: PathBuf::from(r"C:\definitely\not\here.exe"),
            kind: ProgramKind::Executable,
        };

        assert!(matches!(
            supervisor.run("missing", &missing, &[], Duration::from_secs(5)),
            Err(SpawnError::Io(_))
        ));
    }
}
