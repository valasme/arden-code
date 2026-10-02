# 0032. The redesign: a calm frame, and the session in the middle

- Status: Accepted
- Date: 2026-10-02
- Changes the layout parts of [0010](0010-visual-design-system.md), [0016](0016-chat-placeholder-and-demo-agent.md) (the welcome state) and plan sections 6 and 7. The theme itself does not change.

## Context

The foundation works, but it does not look or feel good to use. The maintainer named the worst parts: the command
palette that opens from the title bar, the settings switches, the settings tabs that scroll away with the settings,
and window buttons that do not show a pointer. A review of every screen found more:

- Almost everything sits on the same gray, and 1px borders do all the separating, so nothing leads the eye.
- Settings shows two sidebars side by side, the app's own and the settings tabs.
- The session view runs text the full width of the window, marks who is speaking with tiny gray labels, draws every tool call and file change as a box, and has a one-line message box that looks like a form field.
- With square corners, the switch reads as a half-filled box and the slider's thumb as a square.
- The welcome state shows shortcuts but cannot start anything.

The theme (the colors, the square corners, Inter and Cascadia Code, and the calm rules of plan section 3) is good and
stays. The direction was set with the maintainer: the frame and its lists in the spirit of Linear, the session view in
the spirit of Claude Desktop. Before any code, it was drawn as a set of mockups with the real colors and fonts.

## Decision

**What does not change:** every color token, the zero corner radius, the fonts, brand orange only in brand moments,
no Mica or Acrylic, motion only on overlays, the 1px focus outline, and every gate of plan sections 10 and 11.

- **Pointer cursor.** Every enabled button, link, switch, radio, slider and tab shows the pointer, the window buttons included. Windows apps traditionally keep the arrow; the maintainer asked for the pointer, as Linear and Claude Desktop use it, and it makes what can be pressed obvious.
- **Controls.**
  - The switch is a bordered square track with a square thumb inset by 2px. Off is a gray thumb on the left. On is a filled track with the thumb on the right.
  - The slider is a thin track with an upright thumb, half as wide as it is tall.
  - A choice of a few options is a row of joined buttons (still radio buttons, one group). It wraps under the setting's text on a narrow window.
- **No blur behind overlays.** The scrim of a dialog is a flat tint, darker in dark mode.
- **Title bar.** The field that opens the command palette is a quiet filled strip with no border, so it does not look like a form input.
- **Command palette.** Wide (40rem at most), placed high (a fifth of the way down), a 48px search line, the commands in groups (Session, Go to, View) with their shortcuts drawn as keys, the selected row filled, and a line of key hints along the bottom. The cheat sheet uses the same groups.
- **Sidebar.** New session is the first row, with its shortcut, instead of an outlined button. Each project is a small label over its sessions. Settings is the last row, with its shortcut.
- **Settings has one sidebar.** On a settings page (and the log viewer), the sidebar shows Back, the settings search and the tabs in place of the projects. Back returns to the last page outside Settings. The settings page scrolls by itself, so the tabs never move.
- **A settings page** is a centered column, at most 40rem wide, under the tab's title. Each setting is one row of a bordered list: its name and description, then its control at the end of the row (under the text when the window is narrow), and its reset button.
- **Session view.**
  - The turns sit in a centered reading column, at most 45rem wide.
  - The person's message is a filled block at the end of the line. The agent's reply follows under the agent's name, in 14px text, with no box.
  - Tool calls, file changes and thinking are quiet lines along a rule at the start of the reply, not boxes. Turns are separated by space, not borders.
- **Message box.** A bordered block in the reading column, at least two lines tall. Under the text it names the agent and the project, and holds Send; while a reply runs, Send becomes Stop (the `reply.stop` command, as Esc).
- **Welcome state.** The mark, a question, the line about the Demo agent, the same message box and the shortcut hints under it. Sending from it starts a Demo agent session in the Playground, opens it and sends the message.
- **Status bar.** It says what the open session's agent is doing ("The Demo agent is replying…"), beside the version and the update notice. It is not a live region: the reply announcer already speaks for screen readers (ADR 0027).
- **Pages.** Settings, the log viewer and the error screens share one page header (a 20px title over a muted line) in a centered column.

## Consequences

- The screenshot baselines change everywhere, and the component and end-to-end tests that named the old structure change with it. The accessible names of regions, buttons and links stay where they still describe the same thing.
- The commands in the registry each carry a group, and a test keeps every command in one.
- A component copied from shadcn from now on also gets the pointer, and no blur.
- Choosing an agent and adding a project will need a place in the message box's lower line and in the sidebar; the layout leaves room for both.
