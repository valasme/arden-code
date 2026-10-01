# Title bar checklist

The manual half of the title bar's tests ([plan §6.2](PLAN.md#62-title-bar-and-snap-layouts), ADR 0009). CI
checks that Windows finds a Maximize button exactly where the page draws one, and that the window tells Windows
it can be 500 px wide (`e2e/titlebar.spec.ts`). What only a person can see is below: the Snap Layouts picker
itself, and the window buttons at other display scalings and on another monitor.

Run it on Windows 11 with a build from `pnpm build`, before each release. Change the scaling in Settings →
System → Display → Scale.

## At 100%, 150% and 200% scaling

- [ ] Rest the pointer on Maximize: the Snap Layouts picker appears under it within a second.
- [ ] Pick the left half of a two-zone layout: the window fills that half, and Snap Assist offers windows for the other half.
- [ ] Pick a zone of the three-column layout: the window fits it (the window can be 500 px wide).
- [ ] While the pointer rests on Maximize, the button looks hovered; while it is held down, pressed; when the pointer leaves, normal again.
- [ ] Click Maximize: the window maximizes, and the button becomes Restore. Click it again: the window is restored.
- [ ] Press on Maximize, move off it and release: nothing happens, and the button looks normal.
- [ ] Minimize and Close still have their own hover, and Close turns red.
- [ ] The search field and the button left of Minimize react to the pointer right up to Minimize's edge.

## On a second monitor

- [ ] Move the window to a monitor with a different scaling. Rest the pointer on Maximize: the picker appears there too.
- [ ] Maximize the window on that monitor and rest the pointer on Restore: the picker appears.

## Keyboard and screen reader

- [ ] Tab to Maximize and press Enter, then Space: the window maximizes and is restored, and the focus stays on the button.
- [ ] NVDA and Narrator read the button as "Maximize, button" and, when maximized, "Restore, button".
- [ ] Alt+Space still opens the system menu, and Win+Z still opens the picker.

## The title bar of Windows

- [ ] Turn on Settings → Advanced → "Use native title bar": Windows' own Maximize shows the picker, and nothing
      of the app's overlay is left where its button was.
