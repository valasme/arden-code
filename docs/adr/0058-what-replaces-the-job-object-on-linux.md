# 0058. What replaces the Job Object on Linux

- Status: Accepted
- Date: 2026-10-27
- Decides [#188](https://github.com/valasme/arden-code/issues/188). Extends
  [0028](0028-process-supervisor.md).

## Context

On Windows every program the supervisor starts is in a Job Object that ends it, and everything it
started, when the app ends, however it ends: closed, crashed or ended from Task Manager. The
research in [#184](https://github.com/valasme/arden-code/issues/184) found that no Linux mechanism
does all of that without systemd: process groups need someone to call `kill`; the hangup of a
session needs a controlling terminal, which neither a desktop launch nor a CI step has;
`PR_SET_PDEATHSIG` reaches only the direct child, and fires when the *thread* that started it ends;
a pidfd or a pipe needs a living app to act.

## Decision

Two mechanisms together, chosen because both hold on GitHub's Ubuntu runner and on any desktop
session, Wayland or X11, with no terminal and no systemd:

- **The kernel kills each program when the app ends.** Every program is started with
  `PR_SET_PDEATHSIG` set to `SIGKILL`, between `fork` and `exec`, and checks that the app is still its
  parent. This fires even when the app is killed with `SIGKILL`. As the signal follows the thread that
  started the program, the job starts every program from one thread of its own, which lives as long
  as the job.
- **The job kills what each program started.** Each program leads a process group of its own, so
  what it starts is in the group. When the job ends, the app kills each whole group. The app ends the
  job when it exits normally, and treats `SIGTERM`, `SIGINT` and `SIGHUP` as a request to close, so a
  log out or `kill` ends the programs' groups too.

A program whose file is still open for writing for a moment ("text file busy", as just after an
update) is tried again. Groups that have ended are forgotten each time a program starts, so a group
id that Linux gives out again is not killed by mistake.

## Consequences

- What is not covered, and is documented as such: when the app itself is killed with `SIGKILL` (or
  by the out-of-memory killer), the programs it started directly die, but what *they* started is left
  for its own pipes to end; and a program that leaves its group on purpose (`setsid`, a daemon) is not
  killed.
- The `Job` API changes from "spawn, then assign" to `Job::start(command)`, so the platform can start
  the program its own way. `Supervisor::end_all` ends the job before the app exits.
- The Linux end-to-end test checks both: Claude Code ends when the app is told to stop, and when it is
  killed ([0063](0063-the-linux-end-to-end-test.md)).
