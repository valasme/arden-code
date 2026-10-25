# How Linux can reap child processes when the app exits: research

- Date: 2026-10-25
- Question: What does the Windows Job Object guarantee for child processes, and which Linux mechanisms can match that guarantee for a Tauri app?
- Read at: `crates/arden-process` and the desktop app's supervisor at `0ee2141`; Linux man-pages 6.20, released 2026-10-21 (the pages below; man7.org's HTML that day was still the 6.19 rendering, and the cited sentences match); the GNU C Library manual at <https://sourceware.org/glibc/manual/latest>, read 2026-10-25; GitHub's hosted-runner docs; the Ubuntu 24.04 runner image `20261023.334.3`; `actions/runner` at `f4a774978d95`.

## The answer in short

- **The job ends the whole tree when its last handle closes.** Every process the supervisor assigns, and every program that process starts afterward, dies when that handle closes. The crate states that the close happens when Arden Code ends normally, crashes, or is ended from Task Manager. A process that cannot be assigned is killed at once. On Linux the same `Job` does nothing, so those processes keep running. [JOB] [SUP] [ADR]
- **Process exit on Linux reparents children.** They keep running under init, or under a subreaper if one exists. Termination closes the exiting process's file descriptors. It does not signal the tree. [EXIT] [GLIBC]
- **None of the five mechanisms is that guarantee.** Process groups and a pidfd can name a set of processes, and something still living has to signal them. `setsid`'s hangup reaches only the foreground group of a controlling terminal, which a desktop launch of this app and a GitHub Actions step do not have. `PR_SET_PDEATHSIG` does arrive when the creating thread is SIGKILLed, and it stops at the process that armed it. A close-on-exec pipe's write end does close when the parent is SIGKILLed, which delivers end-of-file to a reader and kills nobody by itself. None of the five requires systemd.

| Mechanism | Grandchildren | When the parent is SIGKILLed | systemd |
| --- | --- | --- | --- |
| Process group | Reached only while they stay in the group, and only when something calls `kill` | Running members are left running | No |
| `setsid` and the session hangup | Only members of the foreground group of a controlling terminal; `SIGHUP` can be ignored | That hangup is sent if the dead process was the session leader of a terminal | No |
| `PR_SET_PDEATHSIG` | Cleared by `fork`, so they are not signaled | Sent when the creating thread dies | No |
| pidfd | One task. Since Linux 6.9 a flag can signal a process group, with the same membership rules, and only if a living process calls it | Closing the descriptor signals nobody | No |
| Close-on-exec pipe | End-of-file is not a kill | The write end closes with the process; a later read returns 0 if no writer remains | No |

This note records those limits. It does not choose a replacement.

## The job, as the crate states it

`arden-process` is the one place that starts programs. On Windows, `job` puts every child in one Job Object so it ends when Arden Code ends, however that happens. [LIB]

One supervisor holds one job. `Job::new` creates the job and sets `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. `assign` puts a process in it "from now on and with everything it starts". `Drop` closes the handle, and the comment on `Drop` says that close is what ends the processes in the job. The module comment states the consequence: the last handle closes when Arden Code ends, whether it closed normally, crashed, or was ended from Task Manager, and Windows then ends every process in the job. [JOB]

What dies is every process in that job: the ones `assign` accepted, and programs they start after that. The supervisor test `a_program_started_by_a_program_in_the_job_ends_with_it_too` starts `cmd.exe`, which starts `ping`, drops the supervisor, and requires the child to have ended. A second test drops the supervisor while a piped child is running and waits until Windows has ended it. The comment on the first of those tests says dropping the supervisor is what happens when Arden Code ends, however it ends, because the handle closes. [SUP]

What survives is a process that was never assigned. If `assign` fails, the supervisor kills that child, waits for it, and returns an error, so a child outside the job is not left running. Processes this supervisor never started are not in the job. The code creates a single handle and does not document a second one; the kill is described as happening when the last handle closes. [JOB] [SUP]

The desktop app builds that supervisor at startup and stores it in Tauri's managed state for the life of the process (`make_supervisor`, `manage_programs`). On Windows the handle stays open until that state is dropped or the process ends. [APP]

On every other system, `Job::new` and `assign` succeed and do nothing. The comment says that without Windows there is no job, and nothing ends a process when the app ends. ADR 0028 records the same Windows rules, and the consequence that without Windows the job does nothing. [JOB] [ADR]

The Linux question is how to get those three properties for this process: the assigned process and programs it starts are ended without their cooperation; that still happens when the process is killed and runs no cleanup; a process that cannot be covered is ended immediately.

## What exit itself does

`_exit` terminates the calling process immediately. Any open file descriptors are closed. Any children are inherited by init, or by the nearest subreaper. The parent is sent `SIGCHLD`. Since glibc 2.3, the `_exit` wrapper calls `exit_group`, which terminates every thread in the process. [EXIT]

The raw `exit` system call is narrower: it terminates only the calling thread, and children are reparented only when that was the last thread. [EXIT]

The GNU C Library manual states the same cleanup for every way a process can end, including a signal: all open file descriptors are closed, children get a new parent (init, on GNU), the parent gets `SIGCHLD`, a session leader that has a controlling terminal causes `SIGHUP` to its foreground job, and a process group that becomes orphaned with a stopped member gets `SIGHUP` and `SIGCONT`. [GLIBC]

`SIGKILL` and `SIGSTOP` cannot be caught, blocked, or ignored. `SIGKILL`'s default action is to terminate the process. [SIG] A SIGKILL of the app is therefore process termination: file descriptors close, children are reparented, and no destructor in the app runs. The job's Task Manager case is this case. The manual's reparenting is the gap: the children keep running.

`PR_SET_CHILD_SUBREAPER` makes the caller play init for its descendants. An orphan is reparented to the nearest living ancestor that set it, and that ancestor can `wait` for it. The attribute is not inherited across `fork` and is preserved across `execve`. The page gives session managers, and systemd, as examples of programs that do this. It is not required by any mechanism below. Where no ancestor has set it, `_exit` names init as the new parent. [SR] [EXIT]

## Process groups

A child inherits its parent's process group and session. Both survive `execve`. `setpgid` moves a process to another group in the same session. `kill` with a pid less than -1 signals every member of the group whose id is the absolute value. The caller needs permission: it must be privileged (`CAP_KILL` in the target's user namespace), or its real or effective user id must match the target's real or saved set-user-id. [CRED] [PG] [KILL] [GLIBC]

Membership can include grandchildren, because they inherit the group until they call `setpgid` or `setsid`. A signal sent to the group reaches those that stayed. Exit of the parent does not send it. [CRED] [KILL]

When a termination orphans a process group, Linux sends `SIGHUP` followed by `SIGCONT` only if some member is stopped, and then to every member of that group. An orphaned group is one where each member's parent is either also in the group or in a different session. Running members are not signaled. [PG] The GNU C Library manual's Termination Internals section says the same. Its Orphaned Process Groups section says a newly orphaned group is sent `SIGHUP` without the stopped-member condition, and that ignoring or handling `SIGHUP` lets the process keep running. On Linux, `setpgid(2)` is the rule that matches Termination Internals. [GLIBC]

`SIGHUP`'s default action is to terminate. A process can ignore it or catch it. A disposition that is ignore or default survives `execve`; a caught signal is reset to the default across `execve`. [SIG] [EXEC]

**Grandchildren.** A group signal reaches a grandchild that still shares the group. `setpgid` or `setsid` takes it out, and the parent cannot stop it doing that. Nothing in process-group membership kills a running grandchild when the parent exits.

**SIGKILL of the parent.** The parent does not run, so it does not call `kill`. The kernel does not signal running members of the group. The stopped-member exception above is the only process-group signal tied to the death itself.

**systemd.** Not used. Process groups are POSIX job control. [PG] [GLIBC]

**A desktop session.** The Tauri process is a Wayland or X11 client kept for the life of the app. [APP] A controlling terminal exists when a session leader opens a terminal. [CRED] A window is not a terminal, so closing the app does not hang up a foreground group. A destructor that called `kill` on the group would run on a normal exit, when managed state is dropped, and would not run under `SIGKILL`. [SIG] [GLIBC]

**The GitHub Ubuntu runner.** The workflows in this repo that run on Linux use `ubuntu-latest`. [CI] On 2026-10-25 the hosted-runner table maps that label to the Ubuntu 24.04 image. The image `20261023.334.3` is Ubuntu 24.04.5 with kernel 6.17.0-1022-azure. The same readme says `ubuntu-latest` moves to Ubuntu 26.04 in November 2026. A standard runner is a new virtual machine, with passwordless `sudo`. [GHA] [IMG]

The runner starts the step shell with `UseShellExecute` false and standard input, output, and error redirected to pipes. It does not open a terminal for the step. On cancellation it sends `SIGINT` and then `SIGTERM` to that one pid (`kill` with a positive pid). `killProcessOnCancel` is false. The Linux "process tree" helper calls `Kill()` on that same process only. [RUN] None of that signals the app's process group when the app exits. Children are reparented and keep running. A grandchild running as another user, which passwordless `sudo` can do, is outside the app's permission to signal. [KILL] [GHA]

## setsid

`setsid` creates a new session if the caller is not already a process group leader. The caller becomes the session leader and the leader of a new process group, and it is the only member of both. The new session starts with no controlling terminal. The glibc wrapper states that the call makes the caller have no controlling terminal. A later `fork` inherits the new session; `execve` preserves it. [SID] [GLIBC]

The hangup rule is separate. If a session leader terminates, `SIGHUP` is sent to each process in the foreground process group of the controlling terminal. The manual states the condition the other way: the leader has a controlling terminal, and then the foreground job is signaled and the terminal is detached. [SID] [GLIBC] `SIGHUP` can be caught or ignored, and its default action is to terminate. [SIG]

A child that calls `setsid` leaves the parent's session and group. Its own children inherit the new session. [SID] [CRED]

**Grandchildren.** The hangup's targets are the foreground group of that terminal, so a grandchild still in that group is included. One that called `setsid` or `setpgid` is not. There is no signal for a background group.

**SIGKILL of the parent.** Termination includes `SIGKILL`. [SIG] [GLIBC] If the dead process is a session leader with a controlling terminal, the kernel still sends that `SIGHUP`. If it is not, the rule has no foreground group to signal.

**systemd.** Not used. [SID]

**A desktop session.** Started from the graphical session, the app is not a session leader that opened a terminal, so its exit sends no hangup. [CRED] Started from a terminal emulator, the session leader is the process that owns that terminal; the app's exit still sends no hangup. If the app calls `setsid` so that it becomes the leader, the new session has no controlling terminal, and the hangup rule still has no foreground group when the app later exits. [SID] [GLIBC]

**The GitHub Ubuntu runner.** The step is started with its standard streams on pipes, on a virtual machine that is not a graphical session. [RUN] [GHA] The launcher does not make the app a session leader of a controlling terminal. The kernel hangup does not run when the app exits. The runner's own signals go to the step pid, not to a session. [RUN]

## PR_SET_PDEATHSIG

The calling process chooses a signal to receive when its parent dies, or 0 to clear it. The signal is sent when the parent thread later terminates, and also when each subreaper it is later reparented to terminates. If the parent thread and every ancestor subreaper have already terminated by the time of the call, no signal is sent. [PD]

The parent in this mechanism is the thread that created the process. The signal is sent when that thread terminates, including by `pthread_exit`, even while other threads of the parent process are still running. [PD]

`fork` clears the setting in the child, so the child does not get a signal when its parent terminates. The setting survives `execve`, except that it is cleared for a set-user-id or set-group-id binary or a binary with file capabilities, and it is cleared if the thread's effective user id, effective group id, filesystem user id, or filesystem group id changes. `execve(2)` records the set-user-id and set-group-id clear. [PD] [FORK] [EXEC]

The signal is process-directed. Delivered to the child, it uses that child's disposition. `SIGKILL` cannot be caught, blocked, or ignored. Any other signal can. [PD] [SIG]

**Grandchildren.** They are created by `fork`, which clears the setting. They are not signaled when the app exits. If the direct child then dies, its children are reparented, not killed by this signal. [FORK] [EXIT]

**SIGKILL of the parent.** A SIGKILL of the process ends the creating thread with the rest, so the kernel sends the armed signal. No code in the parent runs. The early-thread case is the other side of the same rule: if the creating thread exits and the app's other threads live, the child is signaled while the app is still up. [PD] [SIG]

The race is in the same paragraph. The signal is sent on a later death. Armed after the parent thread has already died, it is not sent for that death. If a living subreaper has inherited the child, the signal waits until that subreaper dies. If no ancestor subreaper is alive, it is not sent at all. [PD] [SR]

**systemd.** Not required. The subreaper attribute is what changes reparenting, and the man page names systemd as one program that uses a subreaper. A desktop session manager that has set the attribute changes where an orphan goes and when a late-armed parent-death signal arrives. A session with no such ancestor leaves the orphan with init. [SR] [EXIT]

**A desktop session.** The desktop keeps the supervisor in an `Arc` for the life of the process, so whichever thread starts a program is the creating thread for this signal. [APP] That thread exiting signals the child while the rest of the app is still up. [PD] Grandchildren the agent starts are born with the setting cleared. This crate does not control those programs. [FORK] [LIB] A session that has a subreaper changes only the race above. The signal still stops at the process that armed it.

**The GitHub Ubuntu runner.** The image includes systemd 255.4 and starts services with `systemctl`. [IMG] That does not arm `PR_SET_PDEATHSIG` for the app's children, and it does not keep the setting across `fork`. The same race applies. Passwordless `sudo` is available; a process that changes its effective or filesystem user or group id, or execs a set-user-id binary, loses the setting. [PD] [GHA] The runner's kill path signals the step process only, which is a different mechanism and does not install a parent-death signal. [RUN]

## pidfd

`pidfd_open` returns a file descriptor that refers to one task. The close-on-exec flag is set on it. glibc provides no wrapper; the call is `syscall`. `PIDFD_THREAD` (Linux 6.9) refers to one thread instead of the thread-group leader. [PID]

The documented uses are `pidfd_send_signal`, polling until the task becomes a zombie (and a hangup when it is reaped), `waitid` for a child, `pidfd_getfd`, `setns`, and `process_madvise`. Closing the descriptor is not one of them. A `read` on it fails with `EINVAL`. [PID]

`pidfd_send_signal` signals the task the descriptor refers to, avoiding a recycled pid. Since Linux 6.9, `PIDFD_SIGNAL_PROCESS_GROUP` signals the process group when the descriptor refers to a process-group leader. Permission is the same kind of check as `kill`: the caller can get `EPERM`. glibc provides no wrapper. [PIDSIG] [KILL]

**Grandchildren.** The descriptor names one task, not its children. The process-group flag can include grandchildren that are still in that leader's group, and it misses any that called `setpgid` or `setsid`. Someone has to make the call. [PIDSIG] [PG]

**SIGKILL of the parent.** The descriptor is one of the parent's file descriptors, so termination closes it. [GLIBC] [EXIT] That close does not signal the child. The parent is gone, so it cannot call `pidfd_send_signal`.

**systemd.** Not used. The calls are Linux system calls without a glibc wrapper. [PID] [PIDSIG]

**A desktop session.** The supervisor is inside the app process. [APP] A pidfd it holds dies with the process and does not end the child. The Linux 6.9 group flag still needs a living caller, so it does not cover the Task Manager case. This note does not assume a desktop kernel version; the flag is simply absent before 6.9, and the close-does-not-signal rule holds on every kernel that has pidfds. [PIDSIG]

**The GitHub Ubuntu runner.** The current `ubuntu-latest` image's kernel is 6.17.0-1022-azure, which is new enough for `PIDFD_SIGNAL_PROCESS_GROUP`. [IMG] The gap on that host is the mechanism, not the kernel version. The runner does not hold a pidfd for the app's descendants, and its Linux kill path signals the step pid. [RUN] When the app exits, a pidfd it held closes with it, and the child that descriptor named is reparented. [EXIT] A root grandchild is not signalable by the runner user. [PIDSIG] [KILL]

## A pipe, with close-on-exec on the write end

`pipe` creates a read end and a write end. `pipe2` with `O_CLOEXEC` sets close-on-exec on both new descriptors. When every write-end descriptor is closed, a `read` sees end-of-file and returns 0. `fork` copies the parent's descriptors, so the child holds the write end too until it closes it; close-on-exec takes effect at `execve`, not at `fork`. An executed program keeps descriptors that are not marked close-on-exec. The pipe page says a program that uses `pipe` and `fork` has to close the duplicates it does not need, or end-of-file never arrives. [PIPE] [FORK] [EXEC] [GLIBC]

The usual arrangement is: the parent keeps the write end and leaves it close-on-exec, so programs it execs do not inherit that end; the child keeps the read end across its own exec. When the parent terminates, its descriptors close. If no other write end remains, the reader can observe end-of-file. [EXIT] [GLIBC] [PIPE]

**Grandchildren.** End-of-file does not kill the reader, and it does not signal processes that do not read that descriptor. A grandchild is reparented when its parent exits. [EXIT] If any descendant still has a write end open, the read does not return 0. [PIPE] Close-on-exec on the parent's write end keeps an executed child from receiving that end, so that child cannot pass it on. A child that only forks, and does not exec, keeps the copy. [FORK] [EXEC]

**SIGKILL of the parent.** The process terminates, so its file descriptors close, including the write end. [SIG] [GLIBC] No handler runs. End-of-file becomes visible to a reader once every write end is gone. The kernel does not turn that into a signal. A reader that never reads the pipe, or reads it and keeps running, keeps running. `SIGPIPE` is the other direction: a write with no readers. Its default action is to terminate the writer, which is not this arrangement. [SIG] [PIPE]

**systemd.** Not used. Pipes are ordinary file descriptors. [PIPE]

**A desktop session.** No terminal and no service manager is involved. The session does not hold the write end; the app does, for as long as the process lives. [APP] The mechanism fails the job because the agent CLI is a program this crate does not control: end-of-file ends it only if that program treats the descriptor as fatal, and programs that CLI starts are reparented rather than killed. [EXIT] [LIB]

**The GitHub Ubuntu runner.** The same kernel rules apply on kernel 6.17. The step's redirected standard streams are the runner's pipes, not a death pipe the app created, and the runner does not watch an extra descriptor to kill the app's children. [RUN] [PIPE] A correctly close-on-exec write end is not inherited by the step shell. The failure on this host is the same one: end-of-file is delivered, and the grandchild processes keep running. The runner's new virtual machine per job is a separate lifetime. It is not this pipe ending those processes when the app exits. [GHA] [EXIT]

## Sources

- [JOB] `crates/arden-process/src/job.rs` at `0ee2141`. The Windows kill-on-close job, and the non-Windows type that does nothing.
- [SUP] `crates/arden-process/src/supervisor.rs` at `0ee2141`. Assignment, killing a child that cannot be assigned, and the tests that drop the supervisor.
- [LIB] `crates/arden-process/src/lib.rs` at `0ee2141`.
- [APP] `apps/desktop/src-tauri/src/lib.rs` at `0ee2141`. `make_supervisor` and `manage_programs`.
- [ADR] `docs/adr/0028-process-supervisor.md`.
- [CI] `.github/workflows/ci.yml`, `codeql.yml`, and `release-please.yml`. The Linux workflows use `ubuntu-latest`.
- [PG] `setpgid(2)`, man-pages 6.20 (page dated 2026-07-02). <https://man7.org/linux/man-pages/man2/setpgid.2.html>
- [SID] `setsid(2)`, man-pages 6.20 (page dated 2026-06-05). <https://man7.org/linux/man-pages/man2/setsid.2.html>
- [KILL] `kill(2)`, man-pages 6.20 (page dated 2026-06-05). <https://man7.org/linux/man-pages/man2/kill.2.html>
- [CRED] `credentials(7)`, man-pages 6.20 (page dated 2026-07-02). <https://man7.org/linux/man-pages/man7/credentials.7.html>
- [EXIT] `exit(2)` and `_exit(3)`, man-pages 6.20 (pages dated 2026-06-05 and 2026-07-02). man7.org's HTML of 2026-09-09 still serves the combined text as `_exit(2)`. Also `exit_group(2)`.
- [SIG] `signal(7)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man7/signal.7.html>
- [PD] `PR_SET_PDEATHSIG(2const)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man2/PR_SET_PDEATHSIG.2const.html>
- [SR] `PR_SET_CHILD_SUBREAPER(2const)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html>
- [FORK] `fork(2)`, man-pages 6.20 (page dated 2026-06-05). <https://man7.org/linux/man-pages/man2/fork.2.html>
- [EXEC] `execve(2)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man2/execve.2.html>
- [PID] `pidfd_open(2)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man2/pidfd_open.2.html>
- [PIDSIG] `pidfd_send_signal(2)`, man-pages 6.20 (page dated 2026-02-08). <https://man7.org/linux/man-pages/man2/pidfd_send_signal.2.html>
- [PIPE] `pipe(2)` and `pipe(7)`, man-pages 6.20 (pages dated 2026-02-08 and 2026-07-10). <https://man7.org/linux/man-pages/man2/pipe.2.html>, <https://man7.org/linux/man-pages/man7/pipe.7.html>
- [GLIBC] The GNU C Library manual, read 2026-10-25: Termination Internals, Orphaned Process Groups, Concepts of Job Control, Controlling Terminal of a Process, Process Group Functions, Creating a Pipe, File Descriptor Flags. <https://sourceware.org/glibc/manual/latest/html_node/Termination-Internals.html> and the neighboring sections.
- [GHA] GitHub-hosted runners reference, read 2026-10-25. `ubuntu-latest` links to the Ubuntu 24.04 image; a standard runner is a new virtual machine; Linux runners have passwordless `sudo`. <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>
- [IMG] `actions/runner-images` Ubuntu 24.04 readme, image `20261023.334.3`: Ubuntu 24.04.5, kernel 6.17.0-1022-azure, systemd 255.4-1ubuntu8.17, and the note that `ubuntu-latest` moves to Ubuntu 26.04 in November 2026. <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>
- [RUN] `actions/runner` at `f4a774978d95`: `src/Runner.Sdk/ProcessInvoker.cs` (redirected standard streams at lines 230–234, `kill` of the step pid at line 832, `NixKillProcessTree` at line 855) and `src/Runner.Worker/Handlers/ScriptHandler.cs` (`killProcessOnCancel: false` at line 346).
