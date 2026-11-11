# Scoped, noninteractive read-only Codex processes

- Status: Accepted
- Date: 2026-11-11
- Context: [ADR 0065](0065-codex-as-a-first-class-agent.md), issues #195–#196 and
  [council round 4](../research/codex-support-councils.md#round-4-the-first-working-native-slices).

## Context

Codex's first native slice must do real read-only project work without pretending that Claude's
Manual mode or an unfinished approval UI supplies Codex permissions.

The first native file-read test with Codex 0.167.1 failed closed with `ARD-AGT-031`. An isolated
same-account protocol comparison established the cause: `untrusted` requested command approval;
`never` read the proof file while still reporting `readOnly` and `networkAccess: false`. The CLI's
own help defines `never` as not asking for approval, with failures returned to the model. It is not
`--dangerously-bypass-approvals-and-sandbox`.

A separate failing process test established a lifecycle defect: killing only the server left a
child holding its pipes open. Waiting for the reader then delayed Stop until that child exited.
The app-wide job must not be closed to stop one Codex turn, because other agents may still work.

## Decision

1. The initial Codex driver requests and confirms its native read-only sandbox, with network access
   disabled, and fixed `approvalPolicy: never`. It does not request escalation, invoke bypass flags,
   or equate the policy with a Claude mode. Interactive authority requests remain unsupported and
   fail closed. Broader policies require the later native approvals/permissions slices.
2. Each turn owns a fresh app-server connection. The CLI owns authentication and rollouts; Arden
   Code retains a conversation id only after a successful native resume confirms a checkpoint.
3. Add a per-connection `ProcessScope` to the existing supervisor. It uses the same platform `Job`
   abstraction as the app job. Close that scope before waiting for the child and joining protocol
   readers, so descendants cannot keep pipes open. Do not solve the hang by detaching readers.
4. Register scoped jobs weakly with the supervisor for app shutdown. Completed scopes must not be
   retained by a strong parent reference. Closing one scope must not close another agent's job.
5. Keep the existing unscoped `spawn_piped` behavior for existing consumers. This extends, rather
   than replaces, [ADR 0058's platform implementation](0058-what-replaces-the-job-object-on-linux.md).

## Consequences and limits

- A native Windows file-read reply and saved-session resume were observed. Process fixtures cover
  Stop, inherited pipes, archive, deletion and project removal; they are not vendor-model evidence.
- A fresh process has startup cost. Reusing persistent connections can be evaluated later without
  weakening ownership, correlation, cancellation or checkpoint invariants.
- `never` changes native approval pacing, not the confirmed sandbox. A sandbox is not an assertion
  that every external tool server configured in the person's CLI is itself filesystem-confined.
  Project trust still applies, and unsupported server requests are refused rather than granted.
- This is not the full parent feature or a production-readiness verdict. Native approval/question
  UI, richer capabilities and the cross-platform fault matrix remain release gates. Linux runtime
  behavior has not been exercised on this Windows host.
