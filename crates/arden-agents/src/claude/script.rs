//! A Claude Code that plays a script, for tests (ADR 0038): it checks each frame the driver writes
//! against the frame it expects, and plays its own frames back when the script says so, as T3
//! Code's replay fixtures do.

use std::collections::VecDeque;
use std::io::{self, Read, Write};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use serde_json::Value;

use super::launch::{Connection, LaunchError, Launcher, Start};

/// How long a script waits for a frame it expects before it gives up.
const PATIENCE: Duration = Duration::from_secs(10);

/// One step of a script.
#[derive(Debug, Clone)]
pub enum Step {
    /// The driver writes a frame that holds everything in this one.
    Expect(Value),
    /// Claude Code writes this frame.
    Play(Value),
    /// Claude Code answers the last request the driver made: this response, with its id.
    Answer(Value),
    /// Claude Code writes a line as it is.
    PlayLine(String),
    /// Claude Code ends, with nothing more written.
    End,
}

/// The usual start: the driver's `initialize`, and Claude Code's answer.
pub fn handshake() -> Vec<Step> {
    vec![
        Step::Expect(
            serde_json::json!({ "type": "control_request", "request": { "subtype": "initialize" } }),
        ),
        Step::Answer(
            serde_json::json!({ "type": "control_response", "response": { "subtype": "success" } }),
        ),
    ]
}

/// What a scripted Claude Code is asked to start with, and what goes wrong.
#[derive(Default)]
pub struct Scripted {
    /// The script for each start, in turn.
    scripts: Mutex<VecDeque<Result<Vec<Step>, LaunchError>>>,
    /// What each start was asked for.
    pub starts: Mutex<Vec<Start>>,
    /// Every frame the driver wrote, in order.
    pub written: Arc<Mutex<Vec<Value>>>,
    /// What did not go as the script said.
    pub failures: Arc<Mutex<Vec<String>>>,
}

impl Scripted {
    pub fn new(scripts: Vec<Result<Vec<Step>, LaunchError>>) -> Self {
        Self {
            scripts: Mutex::new(scripts.into()),
            ..Self::default()
        }
    }

    /// Fails the test with what did not go as the script said.
    pub fn assert_followed(&self) {
        let failures = self.failures.lock().unwrap_or_else(PoisonError::into_inner);
        assert!(failures.is_empty(), "{failures:#?}");
    }
}

impl Launcher for Scripted {
    fn launch(&self, start: &Start) -> Result<Connection, LaunchError> {
        self.starts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(start.clone());
        let steps = self
            .scripts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .pop_front()
            .unwrap_or_else(|| Err(LaunchError::Failed("no script left".into())))?;
        let (to_claude, from_driver) = mpsc::channel::<Vec<u8>>();
        let (to_driver, from_claude) = mpsc::channel::<Vec<u8>>();
        let written = Arc::clone(&self.written);
        let failures = Arc::clone(&self.failures);
        thread::spawn(move || play(&steps, &from_driver, to_driver, &written, &failures));
        Ok(Connection {
            input: Box::new(Pipe(to_claude)),
            output: Box::new(Reading {
                chunks: from_claude,
                current: VecDeque::new(),
            }),
            process: None,
        })
    }
}

/// Whether `actual` holds everything in `expected`: every key of an object, every item of a list.
fn holds(actual: &Value, expected: &Value) -> bool {
    match (actual, expected) {
        (Value::Object(actual), Value::Object(expected)) => expected
            .iter()
            .all(|(key, value)| actual.get(key).is_some_and(|found| holds(found, value))),
        _ => actual == expected,
    }
}

/// The lines the driver writes, one at a time.
struct Lines<'a> {
    chunks: &'a Receiver<Vec<u8>>,
    pending: Vec<u8>,
}

impl Lines<'_> {
    fn next(&mut self, patience: Duration) -> Result<String, RecvTimeoutError> {
        loop {
            if let Some(end) = self.pending.iter().position(|&byte| byte == b'\n') {
                let line: Vec<u8> = self.pending.drain(..=end).collect();
                return Ok(String::from_utf8_lossy(&line).trim_end().to_owned());
            }
            let chunk = self.chunks.recv_timeout(patience)?;
            self.pending.extend(chunk);
        }
    }
}

fn play(
    steps: &[Step],
    from_driver: &Receiver<Vec<u8>>,
    to_driver: Sender<Vec<u8>>,
    written: &Mutex<Vec<Value>>,
    failures: &Mutex<Vec<String>>,
) {
    let fail = |text: String| {
        failures
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(text);
    };
    let mut lines = Lines {
        chunks: from_driver,
        pending: Vec::new(),
    };
    let mut last_request = String::new();
    let send = |frame: &Value| {
        let _ = to_driver.send(format!("{frame}\n").into_bytes());
    };
    for (number, step) in steps.iter().enumerate() {
        match step {
            Step::Expect(expected) => {
                let Ok(line) = lines.next(PATIENCE) else {
                    fail(format!("step {number}: the driver never wrote {expected}"));
                    return;
                };
                let actual: Value = serde_json::from_str(&line).unwrap_or(Value::String(line));
                if actual["type"] == "control_request" {
                    last_request = actual["request_id"].as_str().unwrap_or_default().to_owned();
                }
                written
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(actual.clone());
                if !holds(&actual, expected) {
                    fail(format!("step {number}: expected {expected}, got {actual}"));
                }
            }
            Step::Play(frame) => send(frame),
            Step::Answer(response) => {
                let mut response = response.clone();
                response["response"]["request_id"] = Value::String(last_request.clone());
                send(&response);
            }
            Step::PlayLine(line) => {
                let _ = to_driver.send(format!("{line}\n").into_bytes());
            }
            Step::End => return,
        }
    }
    // The script is over: Claude Code stays, and keeps what the driver writes, until the driver
    // lets it go.
    while let Ok(line) = lines.next(Duration::from_secs(3600)) {
        let actual: Value = serde_json::from_str(&line).unwrap_or(Value::String(line));
        written
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(actual);
    }
    drop(to_driver);
}

/// What the driver writes, sent to the script.
struct Pipe(Sender<Vec<u8>>);

impl Write for Pipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0
            .send(buf.to_vec())
            .map_err(|_| io::Error::from(io::ErrorKind::BrokenPipe))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// What the script writes, read by the driver. It ends when the script ends.
struct Reading {
    chunks: Receiver<Vec<u8>>,
    current: VecDeque<u8>,
}

impl Read for Reading {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.current.is_empty() {
            match self.chunks.recv() {
                Ok(chunk) => self.current.extend(chunk),
                Err(_) => return Ok(0),
            }
        }
        let count = buf.len().min(self.current.len());
        for (slot, byte) in buf.iter_mut().zip(self.current.drain(..count)) {
            *slot = byte;
        }
        Ok(count)
    }
}
