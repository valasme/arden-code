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
| Cold start to a usable window | ≤ 1.0 s | From starting the process to its window becoming visible (the app shows it once the first frame is drawn), seen from outside through Windows, on a new settings folder and a new web engine folder. The best of 4 starts. | Past the target × 2.5 |
| Warm start | ≤ 0.4 s | The same, on the folders the first start left behind. The best of 4 starts. | Past the target × 2.5 |
| Idle memory, web engine included | ≤ 200 MB | Private working set of the app and every process it started, after the window has been up for 8 s | Past the target × 2.5 |
| Idle CPU | ≈ 0% | Processor time of the same processes over 20 s | Reported only |
| Applying a settings change | < 50 ms | `src/app/settingsChange.test.tsx`, part of `pnpm test`: the real app in Chromium, from clicking a switch to the change being on screen. The median of 6 changes. The UI applies a change before Rust has saved it, so this is the whole of what a person waits for. | Past the target × 2.5 |
| 10,000 messages in a session | 60 fps | `src/app/longSessions.test.tsx`, part of `pnpm test`: opening the session, how much is drawn, and the frame times while scrolling | Always (it is a test) |

Only the measurements that have a gate can fail. A shared CI machine is slower and noisier than the one the
targets are for, so the margin is 2.5 there and 1.25 on a developer's machine (`ARDEN_PERF_MARGIN` changes it).
The settings change check cannot tell where it runs, so it uses 2.5 everywhere.

The margin on CI is that wide because of the GitHub runner, not the app. The same release build starts cold in
0.7 s on a developer's machine and in 1.9 s on the runner, where the web engine takes about 1.6 s to begin
loading the page on a new folder (0.35 s on the developer's machine). That part happens inside the web engine,
before any of the app's code runs. With a margin of 1.5, the cold start failed on every run. The settings
change took 43 and 81 ms in two runs there.

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

Measured on a development machine (release build, warm start, quiet machine), from the app's log and marks
the page took while it started:

| Step | Time |
|---|---|
| The app starts and Rust sets everything up | ≈ 30 ms |
| The web engine's browser process starts and the window exists | ≈ 310 ms |
| The page loads, runs and draws its first frame | ≈ 105 ms |
| The page finishes loading, and Rust shows the window | ≈ 15 ms |
| **Together** | **≈ 460 ms** |

The web engine's own start is two thirds of it and is not something the app can shorten.

Nothing before the first frame goes through the isolation iframe that Tauri's isolation pattern adds. A round
trip through it takes 150 to 250 ms at that moment, and more on a busy machine, and the start used to make
two: the page asked Rust for the settings and Windows' text size and regional format before drawing, and
then asked Rust to show the window. Now Rust hands both to the page in an initialization script when it
makes the window (`first_frame_script` in `window.rs`, read by `src/lib/firstFrame.ts`), and shows the window
itself when the page has first finished loading (`show_when_first_loaded`), which comes after the first frame
is drawn. That took the warm start from about 650 ms to about 460 ms and the cold start from about 650 ms to
about 480 ms. The page still asks for the window to be shown once it has drawn, which does nothing by then,
and Rust still shows it after 5 s if the page never loads.
