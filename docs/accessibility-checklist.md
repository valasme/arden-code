# Accessibility checklist

The manual half of the accessibility bar in [plan §10](PLAN.md#10-accessibility). Automated checks (axe in the
component and end-to-end tests, the contrast test of every token pair, the pointer target size test) run in CI.
This list is what a person does before each release, with a build from `pnpm build`.

Run it on Windows 11. Tick every line, and write down what failed with the version and build number
(Settings → About) in the release issue. **No release ships unless every line passes.**

## NVDA

Start NVDA before the app. Use the keyboard only.

- [ ] The window title is read when the app opens, and focus lands somewhere sensible.
- [ ] F6 and Shift+F6 move between the title bar, the sidebar, the main area and the status bar, and each area is announced by name.
- [ ] Every button, switch, radio and field in Settings is read with its name, role and state.
- [ ] Changing a setting is announced (a switch says "on" or "off"; a reset says what it reset).
- [ ] In the session view, the messages are a feed: Ctrl+Alt+Down and Up (or the arrow keys in browse mode) move between messages, and each reads as "message N of M".
- [ ] Send a message to the Demo agent. The reply is announced in whole sentences, politely, and is not read word by word. Nothing is announced twice.
- [ ] A reply that fails says so and says why.
- [ ] Esc stops a reply and the stop is announced.
- [ ] The command palette (Ctrl+K) reads its field, the number of results and the selected result as it changes.
- [ ] Dialogs (reset, confirm link, crash report) take the focus, read their title and text, and give the focus back when closed.
- [ ] Toasts are announced without taking the focus.
- [ ] A link that needs confirmation says so before it is opened.

## Narrator

- [ ] Repeat the first four lines of the NVDA list. The window, the areas, the controls of Settings and a changed setting are all read.
- [ ] Scan mode reaches every message of a session and the Jump to latest button.
- [ ] The Demo agent's reply is announced.

## Contrast themes

Turn on each theme in Windows' Settings → Accessibility → Contrast themes (Aquatic, Desert, Dusk, Night sky), one after the other.

- [ ] Text, borders, focus outlines and the selected state are all visible and use the theme's colors.
- [ ] Anything that carries meaning (status, error, warning) is still told apart without its color.
- [ ] The design system page (a debug build, `/dev/design-system`) shows no element that disappears.
- [ ] Switching the theme while the app runs updates it at once, without a restart.

## Zoom and text size

- [ ] At 80%, 100%, 150% and 200% (Ctrl+= and Ctrl+-) nothing overlaps, nothing is cut off, and no area needs to scroll sideways.
- [ ] At 200% the title bar, the sidebar, Settings and a session with a long reply are all usable.
- [ ] Windows' text size at 225% (Settings → Accessibility → Text size) makes the app's text larger, and the layout still holds.
- [ ] The zoom is still there after a restart.

## Motion

- [ ] With "Animation effects" off in Windows, nothing in the app animates.
- [ ] With it on, the motion is short and never the only way to tell that something happened.

## Keyboard

- [ ] Every action can be done without the mouse. Tab order follows what is on the screen.
- [ ] The focus outline is visible on every control, in every theme, and never hidden behind another element.
- [ ] Shift+F10 and the Menu key open the context menu where the mouse would, and Esc gives the focus back.
- [ ] Rebinding a shortcut in Settings → Keyboard works, and a conflict is explained.

## Pointer

- [ ] Every button and switch is at least 24 × 24 px at 100% zoom.
- [ ] The sidebar's resize handle can be used with the keyboard as well as the mouse.

## Other keyboard layouts

- [ ] With a Greek layout selected, the shortcuts still work (they follow the key's position).
