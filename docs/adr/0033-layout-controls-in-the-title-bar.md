# 0033. Layout controls in the title bar

- Status: Accepted
- Date: 2026-10-02
- Changes the status bar and title bar parts of [0032](0032-the-redesign.md), and plan sections 6.1, 6.2 and 6.4.

## Context

The redesign put the toggles for the sidebar and the inspector at the two ends of the status bar. The status bar can
be hidden (Appearance › Show status bar), and with it hidden nothing on screen hides or shows the sidebar or the
inspector, or brings the status bar back. Only the shortcuts and the command palette do, and a person who does not
know them is stuck. VS Code, which many of the people using Arden Code know, keeps these toggles in the title bar.

## Decision

- **Three toggles in the title bar**, after the search strip and before the window buttons: the sidebar, the inspector and the status bar. They stay in the app's own bar with the title bar of Windows too, so they are always on screen.
- **Each is a toggle button.** Its name is the region's ("Sidebar", "Inspector", "Status bar") and does not change; its pressed state says whether the region is shown. The icon is the region's panel icon, with a solid divider while it is shown and a dashed one while it is hidden. The tooltip names the command and its shortcut.
- **They run commands.** The sidebar and inspector toggles run `sidebar.toggle` and `inspector.toggle`, like Ctrl+B and Ctrl+J. A new command, `statusBar.toggle` (Toggle status bar, in the View group, with no default shortcut), flips the Show status bar setting.
- **The status bar only says things:** what the open session's agent is doing, the update notice and the version. Its two toggles go.
- **The title bar takes the controls as a slot.** `TitleBar` stays driven by its props; the app frame hands it the layout controls.

## Consequences

- A person who hides the status bar can always bring it back, and reach the sidebar and the inspector, with the pointer.
- The toggles keep the same name in both states, as the WAI-ARIA toggle button pattern asks, so tests look for "Sidebar" pressed or not pressed instead of "Hide sidebar" and "Show sidebar".
- The screenshot baselines show the toggles in the title bar.
