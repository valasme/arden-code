# 0050. Claude names its sessions

- Status: Accepted
- Date: 2026-10-11
- Adds to how a session is named, from [0035](0035-saving-sessions.md) and [0036](0036-managing-sessions.md), and to
  Arden Code's use of Claude Code's protocol ([0038](0038-claude-through-its-own-protocol.md)).

## Context

A session is named after its first message, shortened, so the sidebar fills with prompts. The maintainer asked for
sessions named as Claude names them (#129): a short title of what the session is about.

What was found, on Claude Code 2.1.292:

- Driven over its protocol, as Arden Code drives it, Claude Code does not name a session by itself: no title came back
  after a first message.
- Its protocol has a request for this, `generate_session_title`, which Claude's own apps use. Given a description, it
  answers with a short title, written by Claude: "Help me fix the flaky login test in the auth service; it times out
  on CI but passes locally." came back as "Login test timeout in CI". With `persist`, Claude Code also keeps the title in
  its own conversation.

Asking a model directly was turned down: it would need a key or a second account, and Claude Code already answers for
the person's own account (ADR 0003). The first message goes to Anthropic through Claude Code either way.

## Decision

- **A Claude session's first message asks its Claude Code for a name,** with `generate_session_title`, right after the
  message is sent, while Claude works on the reply. The name is Arden Code's to keep: it is asked for without
  `persist`, and Claude Code's conversation is left as it is.
- **Until the name comes, and if it never does, the session is named after its first message,** as before. A Claude
  Code that cannot give one (an error, an empty title, an older version) changes nothing.
- **The person's name wins.** The name from Claude is taken only while the session's name is still the one its first
  message gave it: a session renamed before its first message, or while the name was on its way, keeps its name.
- **Only the first message names a session.** Later messages, a linked session's messages and `/clear` leave the name.
- **The Demo agent's sessions keep the first message** as their name; it has no model to write one.

## Consequences

- The sidebar lists sessions by what they are about, from about the end of their first reply: asked during a reply,
  the real Claude Code answered half a second after the reply's result.
- Each new Claude session costs one short request to Claude, as Claude's own apps make.
- The page hears a name through a new event, `session-named`, and updates the header and the lists.
