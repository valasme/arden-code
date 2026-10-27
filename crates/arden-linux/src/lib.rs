//! Linux integration for Arden Code (ADR 0057).
//!
//! What can be read from plain files and the environment is built and tested everywhere; what
//! needs Linux itself, such as `/proc` and GTK, is built on Linux only.

pub mod preferences;
pub mod process;
pub mod system;
