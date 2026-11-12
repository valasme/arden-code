//! Bounded JSON-line RPC over a supervised Codex process. Protocol output is never logged.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::Child;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use arden_process::command::Arg;
use arden_process::resolve::Resolved;
use arden_process::supervisor::{ProcessScope, Supervisor};
use serde_json::{Value, json};

const FRAME_LIMIT: usize = 1024 * 1024;
const QUEUE_LIMIT: usize = 16;
const PENDING_LIMIT: usize = 64;
const POLL: Duration = Duration::from_millis(40);
pub const PATIENCE: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Disconnected,
    Protocol,
    TimedOut,
    Remote,
    Unsupported,
    Cancelled,
}

/// Owns the child and both I/O workers. Cancellation does not wait on a blocked stdin write.
pub struct Client {
    input: Option<SyncSender<Vec<u8>>>,
    output: Option<Receiver<Result<Value, Error>>>,
    child: Child,
    scope: Option<ProcessScope>,
    workers: Vec<JoinHandle<()>>,
    next_id: u64,
    pending: VecDeque<Value>,
}

impl Client {
    pub fn launch(
        supervisor: &Supervisor,
        program: &Resolved,
        folder: &Path,
    ) -> Result<Self, Error> {
        let piped = supervisor
            .spawn_piped_scoped(
                "codex",
                program,
                &[
                    Arg::Literal("app-server"),
                    Arg::Literal("--listen"),
                    Arg::Literal("stdio://"),
                    Arg::Literal("-c"),
                    Arg::Literal("analytics.enabled=false"),
                ],
                folder,
                &[],
            )
            .map_err(|_| Error::Disconnected)?;
        let (send, output) = mpsc::sync_channel(QUEUE_LIMIT);
        let (input, receive) = mpsc::sync_channel::<Vec<u8>>(QUEUE_LIMIT);
        let workers = start_workers(piped.input, piped.output, receive, send);
        Ok(Self {
            input: Some(input),
            output: Some(output),
            child: piped.child,
            scope: piped.scope,
            workers,
            next_id: 0,
            pending: VecDeque::new(),
        })
    }

    pub fn send(&self, value: &Value) -> Result<(), Error> {
        let mut frame = serde_json::to_vec(value).map_err(|_| Error::Protocol)?;
        if frame.len() >= FRAME_LIMIT {
            return Err(Error::Protocol);
        }
        frame.push(b'\n');
        self.input
            .as_ref()
            .ok_or(Error::Disconnected)?
            .try_send(frame)
            .map_err(|_| Error::Disconnected)
    }

    fn receive(&self, timeout: Duration) -> Result<Option<Value>, Error> {
        match self
            .output
            .as_ref()
            .ok_or(Error::Disconnected)?
            .recv_timeout(timeout)
        {
            Ok(frame) => frame.map(Some),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => Err(Error::Disconnected),
        }
    }

    /// Correlates one request while retaining early notifications in a bounded queue.
    pub fn call(
        &mut self,
        method: &str,
        params: Value,
        cancelled: &dyn Fn() -> bool,
        patience: Duration,
    ) -> Result<Value, Error> {
        self.next_id += 1;
        let id = self.next_id;
        let mut frame = json!({"id": id, "method": method});
        frame["params"] = params;
        self.send(&frame)?;
        let deadline = Instant::now() + patience;
        loop {
            if cancelled() {
                return Err(Error::Cancelled);
            }
            if Instant::now() >= deadline {
                return Err(Error::TimedOut);
            }
            let Some(frame) = self.receive(POLL)? else {
                continue;
            };
            if frame.get("method").is_some() {
                if frame.get("id").is_some() {
                    self.reject(&frame)?;
                    return Err(Error::Unsupported);
                }
                if self.pending.len() >= PENDING_LIMIT {
                    return Err(Error::Protocol);
                }
                self.pending.push_back(frame);
            } else if frame["id"] == id {
                if frame.get("error").is_some() {
                    return Err(Error::Remote);
                }
                return frame.get("result").cloned().ok_or(Error::Protocol);
            }
        }
    }

    pub fn initialize(&mut self, cancelled: &dyn Fn() -> bool) -> Result<(), Error> {
        let response = self.call("initialize", json!({
            "clientInfo": {"name": "arden_code", "title": "Arden Code", "version": env!("CARGO_PKG_VERSION")},
            "capabilities": {"experimentalApi": false, "explicitGatewayOauth": true}
        }), cancelled, PATIENCE)?;
        if !response["userAgent"].is_string() || !response["platformOs"].is_string() {
            return Err(Error::Protocol);
        }
        self.send(&json!({"method": "initialized"}))
    }

    /// Drops account fields immediately; neither raw responses nor email/tokens escape this seam.
    pub fn signed_in(&mut self, cancelled: &dyn Fn() -> bool) -> Result<Option<bool>, Error> {
        let response = self.call(
            "account/read",
            json!({"refreshToken": false}),
            cancelled,
            PATIENCE,
        )?;
        let required = response["requiresOpenaiAuth"]
            .as_bool()
            .ok_or(Error::Protocol)?;
        if !required {
            return Ok(None);
        }
        match response.get("account") {
            Some(Value::Null) => Ok(Some(false)),
            Some(account) if matches!(account["type"].as_str(), Some("chatgpt" | "apiKey")) => {
                Ok(Some(true))
            }
            _ => Err(Error::Protocol),
        }
    }

    pub fn reject(&self, frame: &Value) -> Result<(), Error> {
        self.send(&json!({"id": frame["id"], "error": {"code": -32601,
            "message": "Arden Code does not support this request in read-only sessions"}}))
    }

    pub fn next(&mut self) -> Result<Option<Value>, Error> {
        match self.pending.pop_front() {
            Some(frame) => Ok(Some(frame)),
            None => self.receive(POLL),
        }
    }
}

fn start_workers(
    writer: impl Write + Send + 'static,
    reader: impl Read + Send + 'static,
    receive: Receiver<Vec<u8>>,
    send: SyncSender<Result<Value, Error>>,
) -> Vec<JoinHandle<()>> {
    let writing = thread::spawn(move || {
        let mut writer = Some(writer);
        while let Ok(frame) = receive.recv() {
            if let Some(pipe) = writer.as_mut()
                && pipe.write_all(&frame).and_then(|()| pipe.flush()).is_err()
            {
                // Only stdout determines the terminal response: a broken stdin may race a
                // buffered protocol error. Close stdin but keep its bounded queue connected
                // until Client drops, so a later send cannot overtake that response either.
                // In-flight calls still obey their deadline and cancellation polling.
                writer = None;
            }
        }
    });
    let reading = thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        loop {
            let mut line = Vec::new();
            let read = reader
                .by_ref()
                .take((FRAME_LIMIT + 1) as u64)
                .read_until(b'\n', &mut line);
            let value = match read {
                Ok(0) | Err(_) => Err(Error::Disconnected),
                Ok(_) if line.len() > FRAME_LIMIT || !line.ends_with(b"\n") => Err(Error::Protocol),
                Ok(_) => serde_json::from_slice::<Value>(&line).map_err(|_| Error::Protocol),
            };
            let ended = value.is_err();
            if send.send(value).is_err() || ended {
                break;
            }
        }
    });
    vec![writing, reading]
}

impl Drop for Client {
    fn drop(&mut self) {
        // Kill descendants first: one may otherwise keep stdout open after the server dies.
        self.scope.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.input.take();
        self.output.take();
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Cursor};

    struct BrokenInput(mpsc::Sender<()>);

    impl Write for BrokenInput {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::ErrorKind::BrokenPipe.into())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Drop for BrokenInput {
        fn drop(&mut self) {
            let _ = self.0.send(());
        }
    }

    struct BufferedOutput {
        gate: Option<Receiver<()>>,
        bytes: Cursor<Vec<u8>>,
    }

    impl Read for BufferedOutput {
        fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
            if let Some(gate) = self.gate.take() {
                gate.recv_timeout(Duration::from_secs(2))
                    .map_err(|_| io::ErrorKind::TimedOut)?;
            }
            self.bytes.read(bytes)
        }
    }

    #[test]
    fn buffered_stdout_determines_failure_even_when_stdin_breaks_first() {
        for (bytes, expected) in [
            (b"not a JSON frame\n".as_slice(), Error::Protocol),
            (b"".as_slice(), Error::Disconnected),
        ] {
            let (broken, observed) = mpsc::channel();
            let (release, gate) = mpsc::channel();
            let (input, receive) = mpsc::sync_channel(QUEUE_LIMIT);
            let (send, output) = mpsc::sync_channel(QUEUE_LIMIT);
            let workers = start_workers(
                BrokenInput(broken),
                BufferedOutput {
                    gate: Some(gate),
                    bytes: Cursor::new(bytes.to_vec()),
                },
                receive,
                send,
            );
            input
                .send(b"initialize\n".to_vec())
                .expect("a queued request");
            observed
                .recv_timeout(Duration::from_secs(2))
                .expect("the stdin writer has already failed");
            release.send(()).expect("read the buffered stdout now");
            let actual = output.recv_timeout(Duration::from_secs(2));
            drop(input);
            drop(output);
            for worker in workers {
                worker.join().expect("the I/O worker ends");
            }
            assert_eq!(actual.expect("a terminal output result"), Err(expected));
        }
    }
}
