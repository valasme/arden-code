# Performance

The targets are in [plan §11](PLAN.md#11-performance-targets). This page says how each one is measured,
which of them fail CI, and what the numbers were the last time someone looked closely.

```powershell
pnpm test:perf     # builds the release app, then measures it
```

CI runs the same measurements on the release build after the end-to-end tests and writes the table into the
run's summary. The results are also written to `target/performance.json`.

## What is measured, and what fails the check

| Measurement | Target | How | Fails CI |
|---|---|---|---|
| Cold start to a usable window | ≤ 1.0 s | From starting the process to its window becoming visible (the app shows it once the first frame is drawn), seen from outside through Windows, on a new settings folder and a new web engine folder. The best of 4 starts. | Past the target × 1.5 |
| Warm start | ≤ 0.4 s | The same, on the folders the first start left behind. The best of 4 starts. | Reported only |
| Idle memory, web engine included | ≤ 200 MB | Private working set of the app and every process it started, after the window has been up for 8 s | Past the target × 1.5 |
| Idle CPU | ≈ 0% | Processor time of the same processes over 20 s | Reported only |
| Applying a settings change | < 50 ms | `src/app/settingsChange.test.tsx`, part of `pnpm test`: the real app in Chromium, from clicking a switch to the change being on screen. The median of 6 changes. The UI applies a change before Rust has saved it, so this is the whole of what a person waits for. | Past the target × 1.5 |
| 10,000 messages in a session | 60 fps | `src/app/longSessions.test.tsx`, part of `pnpm test`: opening the session, how much is drawn, and the frame times while scrolling | Always (it is a test) |

Only the measurements that have a gate can fail. A shared CI machine is slower and noisier than the one the
targets are for, so the margin is 1.5 there and 1.25 on a developer's machine (`ARDEN_PERF_MARGIN` changes it).

### Why the start-up numbers are the best of several

A start that takes twice as long as the others says that the machine was busy at that moment (the virus
scanner looks at every file a new web engine folder creates, and it does not do so at a steady pace), not that
the app got slower. The best start is what the app can do, and a change that makes the app slower makes the
best start slower too. Every start is printed, so a run that is noisy shows it.

### Why nothing is attached to the app

A release build opens no debugging port: only a debug build does, so that no program on the machine can drive
a person's app. The performance check therefore starts the release build exactly as it is shipped and only
looks at it from outside: the moment its window becomes visible, and the memory and processor time of its
processes. It also clears `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, so a run on a developer's machine takes
the same path as one on CI (the CI runner's web engine ignores that variable).

Attaching would change what is measured, too: the same app used about 10% of a core with a test driving it
through the debugging port, and under 1% without.

## What the start-up time is made of

Measured on a development machine (release build, quiet machine):

| Step | Time |
|---|---|
| The app starts and Rust sets everything up | 5 ms |
| The web engine's browser process starts and the window exists | ≈ 300 ms |
| The page loads | ≈ 100 ms |
| The page runs, asks Rust for the settings, draws, and shows the window | ≈ 200 ms |
| **Together** | **≈ 650 ms** |

The web engine's own start is nearly half of it and is not something the app can shorten. On that machine the
cold start meets its target and the warm start (≈ 600 ms) does not meet 0.4 s, which is why it is reported and
not gated. The two settings the page asks for before its first frame, and the window being shown, go through
the isolation iframe that Tauri's isolation pattern adds; when the machine is busy that first round trip is
what takes the extra 500 to 900 ms that some starts show. Handing the first settings to the page when the
window is made, so that the first frame does not wait for that round trip, is the next thing to try.
