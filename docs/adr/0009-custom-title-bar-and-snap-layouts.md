# 0009. Custom title bar with our own Snap Layouts module

- Status: Accepted
- Date: 2026-09-29

## Context

A custom title bar makes room for navigation and search. But on Windows 11, hovering the Maximize
button only shows the Snap Layouts picker if the window reports that spot as a maximize button: it
must answer the `WM_NCHITTEST` message with `HTMAXBUTTON`. Tauri doesn't support this (tauri#4531,
open since 2022). Community plugins handle it, but each has only a few thousand downloads.

## Decision

- **Title bar:** drawn by the app, with drag regions, double-click to maximize, the Alt+Space system menu, and accessible window buttons styled like Windows'.
- **Snap Layouts:** `arden-windows` places a small native overlay over our Maximize button that answers `HTMAXBUTTON`. We own this code.
- **Fallback:** a "Use native title bar" setting.
- **Effects:** no Mica or Acrylic.

## Consequences

- We maintain a small amount of Win32 code.
- High-DPI, multiple monitors, keyboard and screen-reader behavior of the window buttons need a manual test checklist.
