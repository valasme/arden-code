# 0055. The warm start's gate is on the page's share

- Status: Accepted
- Date: 2026-10-15
- Changes the warm start's gate in [0019](0019-testing-and-quality-gates.md) ("The warm start is gated", issue #30).

## Context

ADR 0019 gates the warm start like the cold start: the best of 4 starts fails past 0.4 s times the margin, which
is 2.5 on CI, so 1,000 ms. Most of a warm start is the web engine's own start, before any of the app's code runs.
That part takes about 340 ms on a developer's machine, 450 to 730 ms on the GitHub runner, and more on a slow
runner.

Across 20 CI runs, the best warm start was 545 to 999 ms, usually within 5 to 20% of the limit. Pull request #168
changed only `Cargo.lock` and failed with best warm starts of 1,261 ms and then 1,097 ms on retry. Its web engine
took 856 to 1,538 ms to begin loading the page. The rest of each start was 241 to 336 ms, as on every other run.
A gate that fails a pull request for the runner's speed fails sometimes, and CLAUDE.md counts that as failing.

The app's log records when the web engine began loading the page, and the check already prints that time for every
start. The time from there until the window is shown is the page loading, running and drawing its first frame, and
Rust showing the window: the part the app controls. On a developer's machine it is about 120 ms.

## Decision

- The warm start's gate is on the page's share: from the page beginning to load to the window being shown, the
  best of the rounds. Its target is 200 ms, so it fails past 500 ms on CI and 250 ms on a developer's machine.
- The end-to-end warm start is still measured and reported against the plan's 0.4 s target, but does not fail
  the check.
- A run in which no warm start logged when its page began fails the check: without that time the page's share
  cannot be told apart from the web engine's.
- The cold start keeps its gate as it is: it has about 40% of its margin to spare on the runner.

## Consequences

- A slow runner no longer fails a pull request through the warm start; a change that makes the page slower to
  load, run or draw still does.
- A change that makes the web engine itself slower to start, such as a flag passed to it, is no longer caught by
  the warm start's gate. The cold start's gate and the reported warm start still show it.
- The arithmetic lives in `e2e/startups.ts` and is unit-tested by Vitest; Playwright ignores `e2e/*.test.ts`.
