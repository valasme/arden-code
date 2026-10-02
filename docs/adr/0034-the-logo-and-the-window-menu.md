# 0034. The logo and the window menu, apart

- Status: Accepted
- Date: 2026-10-02
- Changes the title bar parts of [0009](0009-custom-title-bar-and-snap-layouts.md) and [0024](0024-areas-context-menus-and-browser-features.md), and plan sections 6.1 and 6.2.

## Context

The title bar started with the mark as a button: pressing it opened the window menu of Windows (Restore, Move,
Size, Minimize, Maximize, Close), as the icon at the start of a classic Windows title bar does. Nothing on it says it
is a menu, so it reads as a logo that does something unexpected when pressed. The maintainer asked for the logo to be
only the logo, with the menu on a separate button beside it.

## Decision

- **The logo is only the logo.** The mark, at 16px, is an image named "Arden Code": not a button, and not in the tab order. It lets the pointer through to the bar, so pressing it drags the window, a double click maximizes or restores it, and a right click opens the window menu, as on the bar's empty space.
- **The window menu has its own button**, right after the logo: "Window menu", with Lucide's menu icon at the title bar's 20px. It opens the same window menu as the logo did. Alt+Space and a right click on the bar still open it too.
- **With the title bar of Windows**, both are left out, as the logo button was: Windows draws its own icon and menu.

## Consequences

- The menu is behind a sign people know as a menu, and the logo no longer hides one.
- The bar holds 36px more before the search strip, which narrows to make room. The layout controls already step aside when the bar is too narrow for them.
- A screen reader meets the app's name at the start of the title bar, then the Window menu button.
