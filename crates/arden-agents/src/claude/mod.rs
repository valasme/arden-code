//! Claude, the first real agent (ADR 0038, ADR 0039): Arden Code runs the person's own Claude Code
//! (`claude`) and speaks its protocol over its input and output.

mod approval;
pub mod driver;
pub mod launch;
pub mod locate;
pub mod protocol;
mod question;
mod reply;

#[cfg(test)]
mod script;
#[cfg(test)]
mod tests;
