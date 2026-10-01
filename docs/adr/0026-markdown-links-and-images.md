# 0026. Markdown, links and images in an agent's reply

- Status: Accepted
- Date: 2026-09-30

## Context

An agent's text is untrusted. It can hold raw HTML, tracking images, and links that start programs. Plan sections 6.5 and 12 ask for Markdown that is drawn safely, code that is highlighted and can be copied, and links that open in the default browser.

## Decision

- **Streamdown draws the Markdown** (ADR 0016), with `@streamdown/code` for highlighting. Highlighting uses Shiki's JavaScript regex engine, so no WebAssembly is needed and the content security policy stays as strict as it was. Grammars load on demand from the app's own files.
- **Raw HTML is dropped** (`skipHtml`). A script, an iframe or an `onclick` in a reply is not drawn.
- **Images are never loaded**, whatever their address. The reply shows "Image not shown" with the picture's description. A remote picture is a way to track a person, and the policy already forbids it (`img-src 'self' data:`); this makes it visible.
- **Links have three kinds**, decided by `arden_core::links` in Rust and mirrored by `linkKind.ts` in the UI, both tested against one list of cases (`crates/arden-core/link-cases.json`):
  - a web address (`http`, `https`) opens in the default browser at once;
  - anything Windows would hand to another program (`mailto:`, custom schemes, a `file:` link to a document on this computer) is opened only after the person confirms, in a dialog that shows the address and starts on Cancel;
  - script and data links, programs (`file:` links to `.exe`, `.bat`, `.ps1` and the like), and links to another computer (`file://server/share`, which would send the person's credentials) are never opened, and are shown as plain text.
- **Rust decides again** in `open_link`, whatever the page says: a confirmed link is still refused when its kind is blocked, and a link that needs confirmation is refused without it.
- **The window never navigates away.** A click on a link is cancelled by the page, and a navigation guard in Rust (`navigation.rs`) refuses any address that is not one of the app's own pages, so a link that slipped through cannot turn the window into a browser with the power of the app's commands.
- **Code and tables that scroll are reachable by keyboard**: they are a stop on the Tab key and have a name (Code (ts), Table).
- **Items are drawn as what they are:** thinking is folded away, a tool call is a card with its status, a file change is a card with counts (also written in words for a screen reader), an error stands out, and status markers are lines between the parts of a reply. `/dev/design-system` shows every kind, and a screenshot test keeps them from changing by accident.

## Consequences

- A new kind of link is refused until it is added to the list of cases and to both implementations.
- Streamdown and Shiki add packages to the list of open-source licenses, and grammar files to the app's size. Ticket 27 measures the size.
