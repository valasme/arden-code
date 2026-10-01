//! A process that waits for a tree it belongs to does not wait for itself, as an app that was
//! started again waits for the one that started it. This is a test binary of its own: the tests in
//! one binary share a process, and the processes other tests start would be part of its tree.
#![cfg(windows)]

use std::time::{Duration, Instant};

use arden_windows::process::{self, Identity};

#[test]
fn the_process_that_waits_is_never_waited_for() {
    let me = Identity::current().unwrap();
    let started = Instant::now();

    let ended = process::wait_for_tree(me, Duration::from_secs(3));

    assert!(ended);
    assert!(
        started.elapsed() < Duration::from_secs(1),
        "waited {:?}",
        started.elapsed()
    );
}
