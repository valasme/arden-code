# Whether Playwright can drive a WebKitGTK window: research

- Date: 2026-10-25
- Question: can Playwright drive the real Arden Code window on Linux the way it drives WebView2 on Windows?
  Windows end-to-end tests attach Playwright to WebView2 over the Chrome DevTools Protocol, on debug builds
  only. Linux draws with WebKitGTK. Is there an equivalent attach, and what can it not do?
- Read at: Playwright's browser, BrowserType, and WebView2 pages; the WebKitGTK 6.0 reference manual (stable);
  Tauri 2.12.0 and wry 0.57.0 on docs.rs; Tauri's debug, configuration, and webview-versions pages; this repo
  at `0ee2141`.

## The answer in short

- **Playwright cannot attach to the running Tauri window.** The Windows tests attach with
  `chromium.connectOverCDP`. Playwright documents that method for Chromium-based browsers only. [PW]
- **WebKitGTK's remote debugging facility is the remote Web Inspector, and its client is a browser.** The
  server listens when `WEBKIT_INSPECTOR_SERVER` or `WEBKIT_INSPECTOR_HTTP_SERVER` is set, and only if
  developer extras are on. A WebKitGTK browser opens `inspector://host:port`. With the HTTP variable, any
  browser opens `http://host:port` and loads the inspector application. WebKit does not document that socket
  as a Chrome DevTools Protocol endpoint. [WK]
- **Tauri and wry do not document a DevTools port on Linux.** The page is a WebKitGTK webview (`webkit2gtk`)
  inside the app. Devtools open that engine's inspector window. The Tauri method Arden Code uses to pass
  `--remote-debugging-port` is unsupported on Linux. [TAURI] [WRY]
- **Playwright can drive a separate WebKit, and that browser is not the app's webview.** `webkit.launch()`
  starts Playwright's own patched WebKit. `browserType.connect()` attaches to a browser Playwright's
  `launchServer()` started, and the two sides have to be the same Playwright version. [PW]
- **The real window, CDP, and the suite's real clicks have no equivalent on the Linux window.** A Playwright
  click needs a page from one of those connections. The clicks the suite sends through Windows, with
  Playwright detached, are Win32 input. [PW] [REPO]

## What the Windows tests do

Debug builds pass `--remote-debugging-port` through `additional_browser_args`, from `ARDEN_CODE_DEBUG_PORT`
(`apps/desktop/src-tauri/src/lib.rs`). The end-to-end harness also sets
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` to the same flag (`apps/desktop/e2e/fixtures.ts`). That is the
variable Playwright's WebView2 guide documents. The harness waits for `http://127.0.0.1:<port>/json/version`,
then calls `chromium.connectOverCDP`, and drives the page of the running app. [REPO] [PW-WV2]

Most clicks are Playwright clicks on that page. A test that needs a real click detaches first and clicks
through Win32 `mouse_event` (`apps/desktop/e2e/windows.ts`). The comment there says a click sent through the
debugging port, or any click while a debugging client is attached, reaches the page with different timing.
ADR 0019 and the plan's testing section describe the same split: Playwright over CDP on debug builds, and
Windows input where the real path matters. [REPO]

## Playwright's ways of getting a browser

`BrowserType` can launch a browser or connect to one. The documented browser types are `chromium`, `firefox`,
and `webkit`. [PW]

### `connectOverCDP`

This attaches Playwright to an existing browser over the Chrome DevTools Protocol. The default context is
`browser.contexts()`, and its pages are already open. The endpoint is a CDP WebSocket or an HTTP URL, for
example `http://localhost:9222/` or `ws://127.0.0.1:9222/devtools/browser/<id>`. The sample calls
`playwright.chromium.connectOverCDP`. [PW]

Playwright's note on the method: connecting over the Chrome DevTools Protocol is only supported for
Chromium-based browsers. A second note says this connection is lower fidelity than `browserType.connect()`.
The WebView2 guide uses this method and no other: set `--remote-debugging-port` on the WebView2 control, then
`chromium.connectOverCDP`. That guide is about WebView2 on Windows. [PW] [PW-WV2]

### `connect` and `launchServer`

`browserType.connect()` attaches to an existing browser created by `browserType.launchServer()`. The endpoint
comes from `BrowserServer.wsEndpoint`. The major and minor version of the connecting Playwright have to match
the Playwright that launched the browser. The sample is written with `chromium` and says the same call works
with `webkit` or `firefox`. The browser on the other end is one Playwright started. [PW]

### `webkit.launch`

`browserType.launch()` returns a new browser instance. For WebKit, that instance is the browser Playwright
installs (`npx playwright install webkit`) and keeps under `~/.cache/ms-playwright` on Linux. Playwright's
WebKit is derived from WebKit's main branch, often before those changes reach Safari, and it is patched:
Playwright says it does not work with branded Safari because it relies on patches. Feature availability still
varies by operating system. [PW-B]

`executablePath` can point at another binary. Playwright says it only works with the bundled Chromium,
Firefox, or WebKit, and to use that option at your own risk. The `channel` option selects Chromium, Chrome,
or Edge. It has no WebKitGTK value. [PW]

## What WebKitGTK documents

The WebKitGTK 6.0 manual's remote-inspector page is the port's description of remote debugging. It is
generated from `Source/WebKit/glib/remote-inspector.md.in`. [WK]

The remote Web Inspector debugs a page from another device, for a machine where the inspector cannot share
the screen or where there is no keyboard or mouse. To run the server:

- set `WEBKIT_INSPECTOR_SERVER` or `WEBKIT_INSPECTOR_HTTP_SERVER` to `ip:port`
- enable `WebKitSettings:enable-developer-extras`, which decides whether the inspector may be used at all

The manual's example is MiniBrowser, not an embedded webview:

```sh
export WEBKIT_INSPECTOR_SERVER=192.168.0.50:5000
MiniBrowser --enable-developer-extras=true https://wpewebkit.org
```

The client is another browser. A WebKitGTK browser opens `inspector://192.168.0.50:5000`. The inspector is
itself a web application. If `WEBKIT_INSPECTOR_HTTP_SERVER` is set, the server accepts HTTP and `inspector://`
can be replaced with `http://`, so a non-WebKit browser can load it. The manual says the inspector uses
current Web APIs, so a matching or newer WebKit browser is the best client, and that Chromium and its
derivatives tend to work well with the HTTP inspector server. That sentence is about loading the inspector
page. The page does not mention the Chrome DevTools Protocol, `/json/version`, or `--remote-debugging-port`.
[WK]

The same manual's environment-variables page lists those two variables under "Remote Web Inspector Variables"
and says WebKit's environment variables are for developers, can change behavior, and are not guaranteed to
stay stable across versions. [WK-ENV]

That page also names a separate WebDriver service executable, with log channels for WebDriver Classic (HTTP)
and WebDriver BiDi (WebSockets). That service is not the inspector server. Playwright's `BrowserType` does
not document a connection to it. Tauri and wry do not document starting it for the embedded webview. [WK-ENV]
[PW] [TAURI] [WRY]

## How Tauri hosts the Linux webview

Tauri uses WebView2, based on Edge and therefore Chromium, on Windows. On Linux it uses WebKit through
`webkit2gtk`. The Linux version table is per distribution and incomplete; Tauri says to check the distro's
own packages. [TAURI-WV]

wry 0.57.0, which Arden Code's lockfile pins, is the library that creates the webview. Its platform notes
say WebKitGTK provides webviews on Linux and requires GTK. The Linux dependencies it names are
`webkit2gtk-4.1` (Arch), `libwebkit2gtk-4.1-dev` (Debian and Ubuntu), and `webkit2gtk4.1-devel` (Fedora).
On Linux, `WebViewExtUnix::webview` returns the WebKitGTK webview handle. [WRY]

Devtools in wry enable the web inspector. `WebViewBuilder::with_devtools` only enables it. Opening it is
`WebView::open_devtools` or the page's context menu. `open_devtools` is unsupported on Android and iOS, and
supported on Linux. The `devtools` feature enables this on release builds; debug builds have it anyway. None
of these methods takes a port. [WRY]

Tauri's debug page says the same thing one layer up. Right-click and Inspect Element, or Ctrl+Shift+I, opens
a platform inspector: the webkit2gtk WebInspector on Linux, Safari's inspector on macOS, and Edge DevTools on
Windows. `WebviewWindow::open_devtools` and `close_devtools` show and hide that window. The inspector is on
in development and debug builds; release builds need the `devtools` Cargo feature. The page does not describe
a listening debugging port on Linux. On Android, the same page sends you to `chrome://inspect/#devices`. It
has no Linux equivalent of that. [TAURI-DBG]

The Windows CDP flag has nowhere to go. Tauri 2.12.0's `WebviewBuilder::additional_browser_args` says it is
unsupported on macOS, Linux, Android, and iOS. The configuration reference's `additionalBrowserArgs` is
"additional browser arguments on Windows." wry's default arguments, which that warning mentions, are Chromium
feature flags (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`). [TAURI] [TAURI-CFG]

Arden Code calls `additional_browser_args` with `--remote-debugging-port` on debug builds. On Linux that call
is the unsupported method above. Tauri and wry do not document setting `WEBKIT_INSPECTOR_SERVER` or
`WEBKIT_INSPECTOR_HTTP_SERVER`. WebKit's server, when an application does set one of those variables and
enables developer extras, still has the client described above: a browser loading the inspector. [REPO] [WK]
[TAURI] [WRY]

## What has no equivalent

| Windows capability | On the Linux window |
| --- | --- |
| The real window, as a Playwright page | No documented attach returns a page for the Tauri WebKitGTK webview. `webkit.launch()` opens Playwright's own browser. |
| CDP | `connectOverCDP` is Chromium-only. WebKitGTK documents the remote inspector. Tauri's browser-argument API, the one that carries `--remote-debugging-port` on Windows, is unsupported on Linux. |
| Real clicks | The suite's real clicks are Win32 `mouse_event` after Playwright detaches. Playwright, WebKitGTK, and Tauri document no input path into this window that replaces that. Playwright clicks exist on a page Playwright already holds, which this window does not give it. |

`webkit.launch()` can click, type, and navigate in the browser it started. That is a separate WebKit, patched
by Playwright, in its own window. It is not the WebKitGTK webview inside the Arden Code process. [PW] [WRY]

## Sources

- [PW] BrowserType: `connect`, `connectOverCDP`, `launch`, `launchServer`, `executablePath`,
  <https://playwright.dev/docs/api/class-browsertype>, as published on 2026-10-25. `connectOverCDP` includes
  an option added in v1.61.
- [PW-B] Browsers, the WebKit section and the install layout,
  <https://playwright.dev/docs/browsers>.
- [PW-WV2] WebView2, <https://playwright.dev/docs/webview2>.
- [WK] Remote Web Inspector, WebKitGTK 6.0 stable,
  <https://webkitgtk.org/reference/webkitgtk/stable/remote-inspector.html>. Source template:
  `Source/WebKit/glib/remote-inspector.md.in` in <https://github.com/WebKit/WebKit>, listed from
  `Source/WebKit/PlatformGTK.cmake`.
- [WK-ENV] Environment variables, WebKitGTK 6.0 stable,
  <https://webkitgtk.org/reference/webkitgtk/stable/environment-variables.html>.
- [TAURI] `WebviewBuilder::additional_browser_args` in Tauri 2.12.0,
  <https://docs.rs/tauri/2.12.0/tauri/webview/struct.WebviewBuilder.html#method.additional_browser_args>.
- [TAURI-CFG] Configuration, `additionalBrowserArgs` and `devtools`,
  <https://v2.tauri.app/reference/config/>.
- [TAURI-DBG] Debug, <https://v2.tauri.app/develop/debug/> (page last updated 2025-03-29).
- [TAURI-WV] Webview versions, <https://v2.tauri.app/reference/webview-versions/> (page last updated
  2026-05-17).
- [WRY] wry 0.57.0: the crate (Linux is WebKitGTK), `WebViewBuilder::with_devtools`, `WebView::open_devtools`,
  and `WebViewExtUnix::webview`, <https://docs.rs/wry/0.57.0/wry/>. The app pins this version in
  `Cargo.lock`; Tauri in the same lockfile is 2.12.0.
- [REPO] This repo at `0ee2141`: ADR 0019, plan section 15, `apps/desktop/src-tauri/src/lib.rs`,
  `apps/desktop/e2e/fixtures.ts`, `apps/desktop/e2e/windows.ts`.
