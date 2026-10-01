# 0024. Areas, context menus and the browser's own features

- Status: Accepted; the part on resetting Arden Code is superseded by [0031](0031-restarts-and-reset.md)
- Date: 2026-09-30

## Context

Plan sections 6.4, 6.9 and 10 ask for F6 movement between areas, custom context menus that a
keyboard can open, and an app that does not behave like a browser in release builds.

## Decision

- **Areas** are marked in the markup with `data-area`: `titlebar`, `sidebar`, `session`, `messagebox`, `inspector`, `statusbar`, in that order. F6 and Shift+F6 (commands `focus.next` and `focus.previous`, rebindable like the others) move to the next area that is on screen, wrapping around. The focus goes to the first control in the area, or to the area itself, which is given `tabindex="-1"` when it has nothing to press.
- **Context menus** are drawn by one host (`ContextMenuHost`) built on the dropdown menu, at the place of the click or below the focused element. It handles the `contextmenu` event, Shift+F10 and the Menu key itself, so the keyboard works whether or not the web engine turns those keys into an event. Text fields get Cut, Copy, Paste and Select all (Cut and Copy are off without a selection, and always off for a password; Cut and Paste are off in a read-only field); selected text elsewhere gets Copy.
- **The menu is not modal.** A modal menu hides the rest of the page from assistive technology, and a focusable text field that is hidden that way is an accessibility error. Escape and a click elsewhere close it, and the focus goes back to where it was.
- **The action runs after the menu has closed.** While the menu is open it holds the focus, and editing commands act on the focused element. The text that was selected when the menu opened is kept, because choosing an item can clear the selection.
- **The clipboard goes through Rust** (the official clipboard plugin). The web engine's own clipboard API asks the person for permission to read.
- **Release builds turn the browser off** (`webview.rs`): no reload, print, find or zoom keys (`AreBrowserAcceleratorKeysEnabled`), no default context menu, no status bar, no zoom by wheel or pinch, no swipe navigation, no autofill, no dev tools. The keys used to edit text (Ctrl+A, C, V, X, Z, Y) are not affected. Debug builds keep everything, for developers. The tests that need the release build are in `e2e/release.spec.ts` and run with `pnpm test:e2e:release`.
- **Dev tools** come back with developer mode (ticket 17).

## Consequences

- Every area that is added marks itself with `data-area`, and F6 finds it.
- A component that offers its own menu (a session in the sidebar, later) can add items to the host; today the host knows text fields and selections only.

## Advanced and About (ticket 17)

- **Developer mode** turns the web engine's developer tools, its own menu and its shortcuts back on, live. It is the only thing that lifts the release hardening.
- **The Windows title bar** is a live switch: the window gets or loses Windows' own frame, and the title bar in the page keeps back, forward and search but drops the logo menu, the drag area and the window buttons that Windows now provides.
- **Hardware acceleration** is read before the web engine starts, so it needs a restart: turning it off adds `--disable-gpu` to the engine's arguments at the next start. The row says a restart is waiting, and offers it, until the setting matches what the app started with.
- **Resetting Arden Code** is done at the next start, not at once, because the logs and the engine's cache are in use until the app exits. The request is a marker file; the next start removes the app's folders before anything opens them. Only folders named like the app's own (`config`, `local` or the identifier) are removed, so a data folder pointed at someone's documents is refused.
- **Export and import** use the system's file dialogs from Rust. A file that is not valid settings changes nothing (`ARD-SET-003`).
- **About** shows the commit and its date (worked out when Rust is built, from git), the Windows version (from the registry, telling Windows 11 by its build number) and the version of the web engine. The open-source list is generated from the dependencies by `pnpm licenses:build`, and CI fails when it is out of date.
- **Links** in About open fixed addresses of the project's GitHub page through a Rust command, so nothing the page is given can send the browser elsewhere.
