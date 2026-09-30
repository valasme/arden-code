//! The Demo agent: a clearly labeled stand-in that streams a reply through the real pipeline.

use std::time::Duration;

use crate::driver::{AgentDriver, Flow};
use crate::model::TurnEvent;

/// How long the Demo agent waits between two pieces of its reply, so a person can watch it stream.
const PACE: Duration = Duration::from_millis(30);

/// Streams a plain-text reply word by word. It says what it is, and repeats what it was asked.
#[derive(Debug, Clone, Copy)]
pub struct DemoDriver {
    pace: Duration,
}

impl DemoDriver {
    /// The Demo agent at the speed people read at.
    #[must_use]
    pub const fn new() -> Self {
        Self { pace: PACE }
    }

    /// A Demo agent that does not wait between words, for tests.
    #[must_use]
    pub const fn instant() -> Self {
        Self {
            pace: Duration::ZERO,
        }
    }
}

impl Default for DemoDriver {
    fn default() -> Self {
        Self::new()
    }
}

/// The whole reply to a message.
fn reply_text(prompt: &str) -> String {
    format!(
        "This is the Demo agent. Real agents are coming.\n\nYou wrote: {}\n\nThis reply streams word by word from Rust, through a channel, into the session view.",
        prompt.trim()
    )
}

impl AgentDriver for DemoDriver {
    fn reply(&self, turn_id: &str, prompt: &str, emit: &mut dyn FnMut(TurnEvent) -> Flow) {
        let item_id = format!("{turn_id}-text");
        for piece in reply_text(prompt).split_inclusive(char::is_whitespace) {
            let event = TurnEvent::TextDelta {
                turn_id: turn_id.to_owned(),
                item_id: item_id.clone(),
                text: piece.to_owned(),
            };
            if emit(event) == Flow::Stop {
                return;
            }
            if !self.pace.is_zero() {
                std::thread::sleep(self.pace);
            }
        }
        emit(TurnEvent::Finished {
            turn_id: turn_id.to_owned(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events_of(driver: DemoDriver, prompt: &str) -> Vec<TurnEvent> {
        let mut events = Vec::new();
        driver.reply("turn-1", prompt, &mut |event| {
            events.push(event);
            Flow::Continue
        });
        events
    }

    #[test]
    fn streams_its_reply_in_pieces_and_then_finishes() {
        let events = events_of(DemoDriver::instant(), "hello there");

        assert!(events.len() > 5, "a reply streams in many pieces");
        assert_eq!(
            events.last(),
            Some(&TurnEvent::Finished {
                turn_id: "turn-1".into()
            })
        );
        let text: String = events
            .iter()
            .filter_map(|event| match event {
                TurnEvent::TextDelta { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert!(text.starts_with("This is the Demo agent."));
        assert!(text.contains("You wrote: hello there"));
    }

    #[test]
    fn keeps_every_piece_in_one_text_item() {
        let events = events_of(DemoDriver::instant(), "hi");

        let ids: std::collections::HashSet<&str> = events
            .iter()
            .filter_map(|event| match event {
                TurnEvent::TextDelta { item_id, .. } => Some(item_id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(ids.len(), 1);
    }

    #[test]
    fn stops_when_nobody_is_listening_any_more() {
        let mut seen = 0;
        DemoDriver::instant().reply("turn-1", "hi", &mut |_| {
            seen += 1;
            if seen == 3 {
                Flow::Stop
            } else {
                Flow::Continue
            }
        });

        assert_eq!(seen, 3);
    }
}
