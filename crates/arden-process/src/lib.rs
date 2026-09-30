//! Starting and supervising other programs (plan section 5.8, ADR 0017).
//!
//! Agents are programs Arden Code does not control, started with text that comes from the person
//! and from the agents themselves. This crate is the one place that starts them:
//!
//! - [`resolve`] finds a program on `PATH`, preferring a real `.exe` over a script wrapper;
//! - [`command`] refuses to hand untrusted text to a `.cmd` or `.bat` wrapper, where Windows would
//!   read it as commands;
//! - [`job`] puts every child in a Job Object, so it ends when Arden Code ends, however that
//!   happens;
//! - [`supervisor`] gives each child its own log file.

pub mod command;
pub mod job;
pub mod resolve;
pub mod supervisor;
