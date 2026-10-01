//! Projects, sessions and the agents that answer in them (plan sections 5.7 and 5.8, ADR 0016).
//!
//! A [`store::SessionStore`] holds the projects and their sessions in memory. An
//! [`driver::AgentDriver`] answers a message by producing [`model::TurnEvent`]s, which the store
//! applies and the UI receives. The only driver so far is the [`demo::DemoDriver`].

pub mod demo;
pub mod detect;
pub mod driver;
pub mod model;
pub mod playground;
pub mod store;
