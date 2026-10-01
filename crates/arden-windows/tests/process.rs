//! Waiting for a process and everything it started, through real processes.
#![cfg(windows)]

use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command};
use std::thread;
use std::time::{Duration, Instant};

use arden_windows::process::{self, Identity};

/// Windows' "the process cannot access the file because it is being used by another process".
const SHARING_VIOLATION: i32 = 32;

/// Runs `command_line` in `cmd`, in `folder`.
fn cmd(folder: &Path, command_line: &str) -> Child {
    Command::new("cmd")
        .raw_arg(format!("/c {command_line}"))
        .current_dir(folder)
        .spawn()
        .expect("cmd starts")
}

/// Waits until `file` exists, as a process that was just started gets round to making it.
fn wait_for_file(file: &Path) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !file.exists() {
        assert!(
            Instant::now() < deadline,
            "{} was never made",
            file.display()
        );
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn waiting_for_a_process_lasts_until_what_it_started_has_ended_too() {
    let folder = tempfile::tempdir().unwrap();
    let held = folder.path().join("held.txt");
    // `start /b` starts the inner command without waiting for it, so the outer one ends at once,
    // while the inner one keeps `held.txt` open for as long as ping runs, about a second: the shape
    // of an app whose web engine outlives it.
    let mut outer = cmd(
        folder.path(),
        r#"start "" /b cmd /c "ping -n 2 127.0.0.1 > held.txt""#,
    );
    let outer_identity = Identity::of(&outer).unwrap();
    outer.wait().unwrap();
    wait_for_file(&held);
    let in_use = fs::remove_file(&held).expect_err("the inner command holds the file");
    assert_eq!(in_use.raw_os_error(), Some(SHARING_VIOLATION));

    assert!(process::wait_for_tree(
        outer_identity,
        Duration::from_secs(10)
    ));

    fs::remove_file(&held).expect("nothing holds the file any more");
}

#[test]
fn an_identity_survives_the_trip_through_text() {
    let folder = tempfile::tempdir().unwrap();
    let mut child = cmd(folder.path(), "exit 0");
    let identity = Identity::of(&child).unwrap();
    child.wait().unwrap();

    assert_eq!(identity.to_string().parse::<Identity>().unwrap(), identity);
    assert!("not a process".parse::<Identity>().is_err());
}

#[test]
fn a_later_process_with_the_same_number_is_not_waited_for() {
    let folder = tempfile::tempdir().unwrap();
    let mut later = cmd(folder.path(), "ping -n 30 127.0.0.1 > nul");
    // The process that had this number before started long ago, and has ended.
    let earlier: Identity = format!("{}:1", later.id()).parse().unwrap();
    let started = Instant::now();

    let ended = process::wait_for_tree(earlier, Duration::from_secs(5));

    let waited = started.elapsed();
    let _ = Command::new("taskkill")
        .args(["/pid", &later.id().to_string(), "/T", "/F"])
        .output();
    let _ = later.wait();
    assert!(ended);
    assert!(waited < Duration::from_secs(1), "waited {waited:?}");
}

#[test]
fn waiting_gives_up_when_the_time_is_up() {
    let folder = tempfile::tempdir().unwrap();
    let mut long = cmd(folder.path(), "ping -n 30 127.0.0.1 > nul");
    let identity = Identity::of(&long).unwrap();
    let started = Instant::now();

    let ended = process::wait_for_tree(identity, Duration::from_millis(300));

    let waited = started.elapsed();
    let _ = Command::new("taskkill")
        .args(["/pid", &long.id().to_string(), "/T", "/F"])
        .output();
    let _ = long.wait();
    assert!(!ended);
    // Windows can end a wait up to a tick of its clock early.
    assert!(
        waited >= Duration::from_millis(250) && waited < Duration::from_secs(5),
        "waited {waited:?}"
    );
}
