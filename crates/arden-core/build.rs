//! Records which commit this build was made from, and when that commit was made, so that About
//! and the bug report template can say exactly what is running.

use std::process::Command;

fn git(arguments: &[&str]) -> Option<String> {
    let output = Command::new("git").args(arguments).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

fn main() {
    // The date is the commit's, not today's, so that building twice gives the same answer.
    let commit = git(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "unknown".to_owned());
    let date = git(&["show", "-s", "--format=%cs", "HEAD"]).unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=ARDEN_BUILD_COMMIT={commit}");
    println!("cargo:rustc-env=ARDEN_BUILD_DATE={date}");

    // A new commit changes what HEAD points to.
    println!("cargo:rerun-if-changed=../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../.git/refs");
    println!("cargo:rerun-if-changed=build.rs");
}
