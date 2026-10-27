# 0063. The Linux end-to-end test

- Status: Accepted
- Date: 2026-10-27
- Decides [#187](https://github.com/valasme/arden-code/issues/187). Changes the end-to-end line of
  [0019](0019-testing-and-quality-gates.md).

## Context

On Windows, Playwright attaches to the real app's WebView2 over the Chrome DevTools Protocol, in
debug builds only. The research in [#183](https://github.com/valasme/arden-code/issues/183) found
that Playwright cannot attach to the WebKitGTK window: CDP is Chromium's, WebKitGTK's inspector is a
browser page, and `webkit.launch()` drives a browser of Playwright's own, not the app. End-to-end is
platform behavior, and a Linux failure gates the merge.

## Decision

- **The Linux end-to-end test drives the real app through WebDriver:** `tauri-driver`, Tauri's
  WebDriver server, starts the debug build through `WebKitWebDriver`, WebKitGTK's own, under a virtual
  X server with a D-Bus session of its own. Clicks and typing go through WebKitGTK's own input.
- **Playwright stays the test runner**, with no browser of its own (`playwright.linux.config.ts`);
  the few WebDriver commands the tests need are plain HTTP calls (`e2e-linux/webdriver.ts`), so no
  WebDriver library is added.
- **It checks what is Linux's:** the frame; a Demo agent reply from Rust and the files in the app's
  folders; a Claude session through `claude` found on `PATH`; Claude Code ending when the app is told
  to stop and when it is killed; the terminal command opening a folder in the running app; and the
  regional format read from the locale. The shared behavior stays covered by the UI tests and the
  Windows suite.
- **Only debug builds can be driven,** as on Windows: Tauri allows WebDriver whenever
  `TAURI_WEBVIEW_AUTOMATION` is set, so release builds clear that variable before anything else runs.

## Consequences

- The Windows suite's real Win32 clicks and CDP checks have no Linux counterpart; the Linux suite is
  smaller, and grows when a Linux behavior needs it.
- `tauri-driver` is pinned in CI, and `webkit2gtk-driver` is installed with the system libraries.
