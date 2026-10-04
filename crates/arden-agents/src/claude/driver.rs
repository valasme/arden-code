//! The Claude driver (ADR 0038): one Claude Code per session, kept between turns, spoken to over
//! its input and output.

use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};
use std::thread;
use std::time::{Duration, Instant};

use arden_core::error::ErrorCode;

use super::approval;
use super::launch::{Connection, Conversation, LaunchError, Launcher, Start};
use super::locate::MINIMUM_VERSION;
use super::protocol::{self, Frame, Request};
use super::question;
use super::reply::Reply;
use crate::driver::{AgentDriver, Answer, Control, Flow, ReplyRequest};
use crate::model::{ApprovalState, Item, QuestionAnswer, QuestionState, StatusKind, TurnEvent};

/// How long a new Claude Code has to answer `initialize`: it may be starting MCP servers.
const HANDSHAKE_PATIENCE: Duration = Duration::from_secs(60);
/// How long a stopped reply has to send its last frame before its Claude Code is started again.
const DRAIN_PATIENCE: Duration = Duration::from_secs(30);
/// How long a session's Claude Code is kept with no reply running and nothing heard from it.
const IDLE_END: Duration = Duration::from_mins(10);
/// The longest wait between two looks for a Claude Code that has been idle too long.
const IDLE_LOOK: Duration = Duration::from_secs(30);
/// How long a Claude Code whose input was closed has to end before it is ended.
const ENDING_PATIENCE: Duration = Duration::from_millis(500);
/// What Claude is told when its questions cannot be read, so they cannot be shown.
const UNREADABLE_QUESTIONS: &str =
    "Arden Code could not read these questions, so the person did not see them.";
/// What Claude is told when the person denies a request.
const DENIED: &str = "The person denied this.";
/// What Claude is told about a request that waited when the person stopped the reply.
const STOPPED: &str = "The person stopped the reply.";

/// An approval request that waits for the person's answer.
struct Pending {
    request_id: String,
    item: Item,
    input: serde_json::Value,
    /// The rule Claude Code suggested, to hand back when the person always allows.
    rule: Option<serde_json::Value>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Something the reply hears: a frame from Claude Code, its end, or the person, during a turn.
enum Event {
    Frame(Frame),
    Ended,
    Control { turn: String, control: Control },
}

/// What a frame is, for the log: never what it holds.
fn kind_of(frame: &Frame) -> &'static str {
    match frame {
        Frame::Init { .. } => "init",
        Frame::Stream { .. } => "stream",
        Frame::Assistant { .. } => "assistant",
        Frame::ToolResults { .. } => "tool results",
        Frame::Result { .. } => "result",
        Frame::Request { .. } => "request",
        Frame::Response { .. } => "response",
        Frame::Cancel { .. } => "cancel",
        Frame::Other => "other",
    }
}

/// One running Claude Code, for one session.
struct Live {
    input: Mutex<Box<dyn Write + Send>>,
    events: Mutex<Receiver<Event>>,
    sender: Sender<Event>,
    process: Mutex<Option<Child>>,
    /// How many stopped replies have not sent their result yet: their late frames come first.
    owed: AtomicUsize,
    /// The conversation it carries on, and whether the session remembers it already.
    conversation: String,
    remembered: AtomicBool,
    /// When Claude Code last wrote, or a reply last ended.
    heard: Arc<Mutex<Instant>>,
    /// Whether a reply is using it, which keeps it however long the reply takes.
    busy: AtomicBool,
}

impl Live {
    /// Starts reading what Claude Code writes, on a thread of its own.
    fn begin(connection: Connection, session_id: &str, conversation: &Conversation) -> Self {
        let (sender, events) = mpsc::channel();
        let reader = sender.clone();
        let session = session_id.to_owned();
        let output = connection.output;
        let heard = Arc::new(Mutex::new(Instant::now()));
        let hearing = Arc::clone(&heard);
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                *lock(&hearing) = Instant::now();
                match protocol::parse(&line) {
                    Some(frame) => {
                        tracing::debug!(%session, frame = kind_of(&frame), "a frame from Claude Code");
                        if reader.send(Event::Frame(frame)).is_err() {
                            return;
                        }
                    }
                    None if line.trim().is_empty() => {}
                    None => {
                        tracing::debug!(%session, "a line from Claude Code that is not a frame");
                    }
                }
            }
            let _ = reader.send(Event::Ended);
        });
        Self {
            input: Mutex::new(connection.input),
            events: Mutex::new(events),
            sender,
            process: Mutex::new(connection.process),
            owed: AtomicUsize::new(0),
            conversation: match conversation {
                Conversation::New(id) | Conversation::Resume(id) => id.clone(),
            },
            remembered: AtomicBool::new(matches!(conversation, Conversation::Resume(_))),
            heard,
            busy: AtomicBool::new(false),
        }
    }

    /// Whether it has had nothing to do for `idle`.
    fn idle_for(&self, idle: Duration) -> bool {
        !self.busy.load(Ordering::Acquire) && lock(&self.heard).elapsed() >= idle
    }

    fn write(&self, frame: &str) -> io::Result<()> {
        let mut input = lock(&self.input);
        input.write_all(frame.as_bytes())?;
        input.write_all(b"\n")?;
        input.flush()
    }
}

impl Drop for Live {
    /// Closes Claude Code's input, which ends it, and ends it if it has not ended soon after.
    fn drop(&mut self) {
        *lock(&self.input) = Box::new(io::sink());
        if let Some(mut child) = lock(&self.process).take() {
            let deadline = Instant::now() + ENDING_PATIENCE;
            while Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    return;
                }
                thread::sleep(Duration::from_millis(20));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Why a reply could not reach Claude.
enum Problem {
    Launch(LaunchError),
    Stopped(String),
    NotUnderstood(String),
}

impl Problem {
    fn code(&self) -> ErrorCode {
        match self {
            Self::Launch(LaunchError::NotInstalled) => ErrorCode::ClaudeNotInstalled,
            Self::Launch(LaunchError::TooOld(_)) => ErrorCode::ClaudeTooOld,
            Self::Launch(LaunchError::NpmWrapperOnly) => ErrorCode::ClaudeNpmWrapper,
            Self::Launch(LaunchError::Failed(_)) | Self::Stopped(_) => ErrorCode::ClaudeStopped,
            Self::NotUnderstood(_) => ErrorCode::ClaudeNotUnderstood,
        }
    }

    /// Details for the logs and for Copy details.
    fn details(&self) -> String {
        match self {
            Self::Launch(LaunchError::NotInstalled) => "claude was not found on PATH".into(),
            Self::Launch(LaunchError::TooOld(version)) => {
                format!("Claude Code {version} is installed; {MINIMUM_VERSION} or later is needed")
            }
            Self::Launch(LaunchError::NpmWrapperOnly) => {
                "only npm's claude.cmd was found, with no program beside it".into()
            }
            Self::Launch(LaunchError::Failed(why))
            | Self::Stopped(why)
            | Self::NotUnderstood(why) => why.clone(),
        }
    }
}

/// The Claude Code of each session that has one running.
type Running = Mutex<HashMap<String, Arc<Live>>>;

/// Ends each Claude Code that has been idle for `idle`, until the driver is gone.
fn end_when_idle(running: &Weak<Running>, idle: Duration) {
    let look = (idle / 4).clamp(Duration::from_millis(5), IDLE_LOOK);
    loop {
        thread::sleep(look);
        let Some(running) = running.upgrade() else {
            return;
        };
        // Taken out under the lock, and ended after it: ending waits for the process.
        let ended: Vec<Arc<Live>> = {
            let mut running = lock(&running);
            let idle_ones: Vec<String> = running
                .iter()
                .filter(|(_, live)| live.idle_for(idle))
                .map(|(session, _)| session.clone())
                .collect();
            idle_ones
                .iter()
                .filter_map(|session| {
                    tracing::debug!(%session, "Claude Code was idle, so it is ended");
                    running.remove(session)
                })
                .collect()
        };
        drop(ended);
    }
}

/// Answers messages through the person's own Claude Code, one per session.
pub struct ClaudeDriver {
    launcher: Arc<dyn Launcher>,
    live: Arc<Running>,
    requests: AtomicU64,
}

/// Marks a session's Claude Code as used by a reply until the reply ends.
struct Busy<'a>(&'a Live);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        *lock(&self.0.heard) = Instant::now();
        self.0.busy.store(false, Ordering::Release);
    }
}

impl ClaudeDriver {
    /// A driver that ends a session's Claude Code after 10 minutes with nothing to do.
    #[must_use]
    pub fn new(launcher: Arc<dyn Launcher>) -> Self {
        Self::with_idle_end(launcher, IDLE_END)
    }

    /// A driver that ends a session's Claude Code after `idle` with nothing to do.
    #[must_use]
    pub fn with_idle_end(launcher: Arc<dyn Launcher>, idle: Duration) -> Self {
        let live: Arc<Running> = Arc::new(Mutex::new(HashMap::new()));
        let running = Arc::downgrade(&live);
        thread::spawn(move || end_when_idle(&running, idle));
        Self {
            launcher,
            live,
            requests: AtomicU64::new(0),
        }
    }

    /// A new id for a request of Arden Code's.
    fn next_request(&self) -> String {
        format!(
            "arden-{}",
            self.requests.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    /// The Claude Code of a session, marked busy, started and greeted when it is not running. It
    /// carries on the session's conversation when it has one; when Claude Code cannot find it, a
    /// new conversation starts, and the answer says so.
    fn live(
        &self,
        session_id: &str,
        folder: &Path,
        saved: Option<&str>,
    ) -> Result<(Arc<Live>, bool), Problem> {
        if let Some(live) = lock(&self.live).get(session_id) {
            live.busy.store(true, Ordering::Release);
            return Ok((Arc::clone(live), false));
        }
        let fresh = || Conversation::New(uuid::Uuid::new_v4().to_string());
        let Some(saved) = saved else {
            return self
                .start(session_id, folder, fresh())
                .map(|live| (live, false));
        };
        match self.start(session_id, folder, Conversation::Resume(saved.to_owned())) {
            Ok(live) => Ok((live, false)),
            // Claude Code ends at once when it has no such conversation.
            Err(Problem::Stopped(why)) => {
                tracing::warn!(session = %session_id, %why, "Claude Code did not carry on the conversation, so a new one starts");
                self.start(session_id, folder, fresh())
                    .map(|live| (live, true))
            }
            Err(problem) => Err(problem),
        }
    }

    /// Starts and greets a Claude Code for a session, in a conversation.
    fn start(
        &self,
        session_id: &str,
        folder: &Path,
        conversation: Conversation,
    ) -> Result<Arc<Live>, Problem> {
        let start = Start {
            folder: folder.to_path_buf(),
            conversation,
        };
        let connection = self.launcher.launch(&start).map_err(Problem::Launch)?;
        let live = Arc::new(Live::begin(connection, session_id, &start.conversation));
        let id = self.next_request();
        live.write(&protocol::initialize(&id)).map_err(|error| {
            Problem::Stopped(format!("Claude Code could not be written to: {error}"))
        })?;
        let deadline = Instant::now() + HANDSHAKE_PATIENCE;
        {
            let events = lock(&live.events);
            loop {
                match events.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    Ok(Event::Frame(Frame::Response {
                        id: answered,
                        error,
                    })) if answered == id => {
                        if let Some(error) = error {
                            return Err(Problem::NotUnderstood(format!(
                                "Claude Code refused to start the conversation: {error}"
                            )));
                        }
                        break;
                    }
                    Ok(Event::Ended) | Err(RecvTimeoutError::Disconnected) => {
                        return Err(Problem::Stopped(
                            "Claude Code ended before the conversation started".into(),
                        ));
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        return Err(Problem::NotUnderstood(
                            "Claude Code did not answer when the conversation started".into(),
                        ));
                    }
                    Ok(_) => {}
                }
            }
        }
        live.busy.store(true, Ordering::Release);
        lock(&self.live).insert(session_id.to_owned(), Arc::clone(&live));
        Ok(live)
    }

    /// Forgets the Claude Code of a session, which ends it.
    fn forget(&self, session_id: &str) {
        lock(&self.live).remove(session_id);
    }

    /// Stops the turn that is running. Its result is still to come, after the frames it had sent.
    fn interrupt(&self, live: &Live) {
        let _ = live.write(&protocol::interrupt(&self.next_request()));
        live.owed.fetch_add(1, Ordering::AcqRel);
    }

    /// The Claude Code of a session, ready for a message: the late frames of any reply that was
    /// stopped are read first and set aside, up to its result. One that does not finish them is
    /// ended, and another is started.
    fn settled(
        &self,
        session_id: &str,
        folder: &Path,
        saved: Option<&str>,
    ) -> Result<(Arc<Live>, bool), Problem> {
        let (live, lost) = self.live(session_id, folder, saved)?;
        let deadline = Instant::now() + DRAIN_PATIENCE;
        {
            let events = lock(&live.events);
            while live.owed.load(Ordering::Acquire) > 0 {
                match events.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    Ok(Event::Frame(Frame::Result { .. })) => {
                        live.owed.fetch_sub(1, Ordering::AcqRel);
                    }
                    Ok(Event::Frame(Frame::Request { id, request })) => {
                        let answer = match request {
                            Request::CanUseTool(_) => {
                                protocol::deny(&id, "The person stopped the reply.", false)
                            }
                            Request::Other(subtype) => protocol::refuse(
                                &id,
                                &format!("Arden Code does not serve {subtype}"),
                            ),
                        };
                        let _ = live.write(&answer);
                    }
                    Ok(_) => {}
                    Err(_) => {
                        drop(events);
                        tracing::warn!(session = %session_id, "a stopped reply never ended, so Claude Code is started again");
                        self.forget(session_id);
                        let saved = live
                            .remembered
                            .load(Ordering::Acquire)
                            .then(|| live.conversation.clone());
                        drop(live);
                        return self.live(session_id, folder, saved.as_deref());
                    }
                }
            }
        }
        Ok((live, lost))
    }
}

/// Hands the person's answer to a request back to Claude Code, and says what became of it. A
/// denial stops the turn: its result is still to come.
fn hand_back(live: &Live, answered: &Pending, answer: Answer) -> ApprovalState {
    match answer {
        Answer::Deny => {
            let _ = live.write(&protocol::deny(&answered.request_id, DENIED, true));
            live.owed.fetch_add(1, Ordering::AcqRel);
            ApprovalState::Denied
        }
        Answer::AlwaysAllow if answered.rule.is_some() => {
            let rules: Vec<serde_json::Value> = answered.rule.iter().cloned().collect();
            let _ = live.write(&protocol::allow(
                &answered.request_id,
                &answered.input,
                &rules,
            ));
            ApprovalState::AlwaysAllowed
        }
        Answer::Allow | Answer::AlwaysAllow => {
            let _ = live.write(&protocol::allow(&answered.request_id, &answered.input, &[]));
            ApprovalState::Allowed
        }
    }
}

/// Ends a reply that could not reach Claude, with what to do.
fn fail(turn_id: &str, problem: &Problem, emit: &mut dyn FnMut(TurnEvent) -> Flow) {
    let _ = emit(TurnEvent::ItemAdded {
        turn_id: turn_id.to_owned(),
        item: Item::Error {
            id: format!("{turn_id}-error"),
            message: problem.details(),
            code: Some(problem.code()),
        },
    });
    let _ = emit(TurnEvent::Failed {
        turn_id: turn_id.to_owned(),
    });
}

/// One reply as it happens: the frames Claude Code sends, the requests that wait for the person,
/// and the person's answers and stop.
struct Answering<'a> {
    driver: &'a ClaudeDriver,
    live: &'a Live,
    turn_id: &'a str,
    folder: &'a Path,
    reply: Reply,
    pending: Vec<Pending>,
    /// Remembers the conversation for the session, once Claude has answered in it.
    remember: &'a dyn Fn(&str),
}

/// Whether a reply goes on after something it heard.
#[derive(PartialEq, Eq)]
enum Next {
    Continue,
    Over,
    /// Claude Code ended in the middle of the reply.
    Ended,
}

impl Answering<'_> {
    fn added(&self, item: Item) -> TurnEvent {
        TurnEvent::ItemAdded {
            turn_id: self.turn_id.to_owned(),
            item,
        }
    }

    /// Hands an event to the session; when the session wants the reply stopped, it stops.
    fn show(&mut self, event: TurnEvent, emit: &mut dyn FnMut(TurnEvent) -> Flow) -> Next {
        if emit(event) == Flow::Stop {
            self.stop();
            return Next::Over;
        }
        Next::Continue
    }

    /// Stops the reply: each request that waits is answered no, then Claude Code is interrupted.
    fn stop(&mut self) {
        self.deny_waiting();
        self.driver.interrupt(self.live);
    }

    /// Answers no to each request that still waits, as the reply is over.
    fn deny_waiting(&mut self) {
        for waiting in self.pending.drain(..) {
            let _ = self
                .live
                .write(&protocol::deny(&waiting.request_id, STOPPED, false));
        }
    }

    /// Claude Code asks for permission: the request waits for the person.
    fn on_permission(
        &mut self,
        id: String,
        permission: protocol::Permission,
        emit: &mut dyn FnMut(TurnEvent) -> Flow,
    ) -> Next {
        let (item, rule) = if permission.tool == question::TOOL {
            let Some(item) = question::item(self.turn_id, &id, &permission) else {
                let _ = self
                    .live
                    .write(&protocol::deny(&id, UNREADABLE_QUESTIONS, false));
                return Next::Continue;
            };
            (item, None)
        } else {
            (
                approval::item(self.turn_id, &id, &permission, self.folder),
                approval::rule_of(&permission.suggestions).map(|(_, rule)| rule),
            )
        };
        self.pending.push(Pending {
            request_id: id,
            item: item.clone(),
            input: permission.input,
            rule,
        });
        let event = self.added(item);
        self.show(event, emit)
    }

    /// Claude Code no longer needs an answer to a request.
    fn on_cancel(&mut self, id: &str, emit: &mut dyn FnMut(TurnEvent) -> Flow) -> Next {
        let Some(at) = self
            .pending
            .iter()
            .position(|waiting| waiting.request_id == id)
        else {
            return Next::Continue;
        };
        let given_up = self.pending.remove(at);
        let item = match given_up.item {
            Item::Questions { .. } => {
                question::with_answers(&given_up.item, Vec::new(), QuestionState::Cancelled)
            }
            _ => approval::with_state(&given_up.item, ApprovalState::Cancelled),
        };
        let event = self.added(item);
        self.show(event, emit)
    }

    /// The person answers questions: they go back to Claude Code, keyed by each question's text.
    fn on_answers(
        &mut self,
        item_id: &str,
        answers: &[QuestionAnswer],
        emit: &mut dyn FnMut(TurnEvent) -> Flow,
    ) -> Next {
        let Some(at) = self.pending.iter().position(|waiting| {
            waiting.item.id() == item_id && matches!(waiting.item, Item::Questions { .. })
        }) else {
            return Next::Continue;
        };
        let answered = self.pending.remove(at);
        let answers = question::to_asked(&answered.item, answers);
        let input = question::answered_input(&answered.input, &answers);
        let _ = self
            .live
            .write(&protocol::allow(&answered.request_id, &input, &[]));
        let event = self.added(question::with_answers(
            &answered.item,
            answers,
            QuestionState::Answered,
        ));
        self.show(event, emit)
    }

    /// The person answers a request. Denying it stops the reply.
    fn on_answer(
        &mut self,
        item_id: &str,
        answer: Answer,
        emit: &mut dyn FnMut(TurnEvent) -> Flow,
    ) -> Next {
        let Some(at) = self.pending.iter().position(|waiting| {
            waiting.item.id() == item_id && matches!(waiting.item, Item::Approval { .. })
        }) else {
            return Next::Continue;
        };
        let answered = self.pending.remove(at);
        let state = hand_back(self.live, &answered, answer);
        let event = self.added(approval::with_state(&answered.item, state));
        if state != ApprovalState::Denied {
            return self.show(event, emit);
        }
        self.deny_waiting();
        let _ = emit(event);
        let _ = emit(TurnEvent::Stopped {
            turn_id: self.turn_id.to_owned(),
        });
        Next::Over
    }

    /// A frame of the reply.
    fn on_frame(&mut self, frame: &Frame, emit: &mut dyn FnMut(TurnEvent) -> Flow) -> Next {
        // Claude has answered in the conversation: from now on it can be carried on.
        if matches!(frame, Frame::Result { .. })
            && !self.live.remembered.swap(true, Ordering::AcqRel)
        {
            (self.remember)(&self.live.conversation);
        }
        for event in self.reply.on(frame) {
            if self.show(event, emit) == Next::Over {
                return Next::Over;
            }
        }
        if self.reply.ended() {
            Next::Over
        } else {
            Next::Continue
        }
    }

    /// What the reply does with something it heard.
    fn on(&mut self, event: Event, emit: &mut dyn FnMut(TurnEvent) -> Flow) -> Next {
        match event {
            Event::Frame(Frame::Request {
                id,
                request: Request::CanUseTool(permission),
            }) => self.on_permission(id, permission, emit),
            Event::Frame(Frame::Request {
                id,
                request: Request::Other(subtype),
            }) => {
                let _ = self.live.write(&protocol::refuse(
                    &id,
                    &format!("Arden Code does not serve {subtype}"),
                ));
                Next::Continue
            }
            Event::Frame(Frame::Cancel { id }) => self.on_cancel(&id, emit),
            Event::Frame(frame) => self.on_frame(&frame, emit),
            Event::Control { turn, control } if turn == self.turn_id => match control {
                Control::Answer { item_id, answer } => self.on_answer(&item_id, answer, emit),
                Control::Answers { item_id, answers } => self.on_answers(&item_id, &answers, emit),
                Control::Stop => {
                    self.stop();
                    Next::Over
                }
            },
            // The person's doing in a turn that is over.
            Event::Control { .. } => Next::Continue,
            Event::Ended => Next::Ended,
        }
    }
}

impl AgentDriver for ClaudeDriver {
    fn reply(&self, request: ReplyRequest<'_>, emit: &mut dyn FnMut(TurnEvent) -> Flow) {
        let (session_id, turn_id) = (request.session_id, request.turn_id);
        let (live, lost) = match self.settled(session_id, request.folder, request.conversation) {
            Ok(settled) => settled,
            Err(problem) => {
                tracing::warn!(session = %session_id, details = %problem.details(), "Claude could not be reached");
                fail(turn_id, &problem, emit);
                return;
            }
        };
        let _busy = Busy(&live);
        if lost
            && emit(TurnEvent::ItemAdded {
                turn_id: turn_id.to_owned(),
                item: Item::Status {
                    id: format!("{turn_id}-new-conversation"),
                    kind: StatusKind::NewConversation,
                },
            }) == Flow::Stop
        {
            return;
        }
        if matches!(request.controls.try_recv(), Ok(Control::Stop)) {
            return;
        }
        let forward = live.sender.clone();
        let controls = request.controls;
        let turn = turn_id.to_owned();
        thread::spawn(move || {
            while let Ok(control) = controls.recv() {
                let event = Event::Control {
                    turn: turn.clone(),
                    control,
                };
                if forward.send(event).is_err() {
                    break;
                }
            }
        });
        if let Err(error) = live.write(&protocol::user_message(request.prompt)) {
            self.forget(session_id);
            fail(
                turn_id,
                &Problem::Stopped(format!("Claude Code could not be written to: {error}")),
                emit,
            );
            return;
        }
        let mut turn = Answering {
            driver: self,
            live: &live,
            turn_id,
            folder: request.folder,
            reply: Reply::new(turn_id, request.folder),
            pending: Vec::new(),
            remember: request.remember,
        };
        let events = lock(&live.events);
        loop {
            let Ok(event) = events.recv() else {
                return;
            };
            match turn.on(event, emit) {
                Next::Continue => {}
                Next::Over => return,
                Next::Ended => {
                    drop(events);
                    self.forget(session_id);
                    fail(
                        turn_id,
                        &Problem::Stopped("Claude Code ended before the reply did".into()),
                        emit,
                    );
                    return;
                }
            }
        }
    }

    fn end(&self, session_id: &str) {
        self.forget(session_id);
    }
}
