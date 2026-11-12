# Vendors

Recorded checks of vendor terms and Arden Code's integration policies. Each external check names its date;
an internal policy change does not refresh that check or establish a vendor's permission. Check again before
a release, and when a vendor announces a change.

## Anthropic: Claude

Checked on 2026-10-03, against Claude Code's [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
page and the [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview).

### What the terms say

- **Allowed:** a person signing in to the unmodified Claude Code program with their own Claude plan, and a product
  saying in plain text that it runs Claude Code.
- **Not allowed:** a third party offering Claude.ai sign-in in its own app, sending requests through Free, Pro or Max
  credentials on behalf of its users, or collecting, storing or passing on Claude.ai credentials or tokens. Signing in
  has to go through Anthropic's own flow.
- **Products built on the Agent SDK** are pointed at API keys, and may not offer Claude.ai sign-in or its usage limits
  unless Anthropic approved it.
- **Names:** "Claude", inside a menu of agents, is allowed. "Claude Code" as an agent's name, and anything that looks
  like Claude Code, is not. Anthropic's names and logos may not be part of a product's own name or logo.

### What Arden Code does

- It starts the person's own `claude`, as installed and as published, and never changes it (ADR 0038).
- It manages Claude's plugins only by running Claude Code's own documented `claude plugin` commands, at the person's
  action (ADR 0053), checked against [Install and manage plugins](https://code.claude.com/docs/en/discover-plugins) on
  2026-10-11. It writes none of Claude Code's files.
- It never signs in, never offers a sign-in, and never reads, stores or passes on a token. The person signs in in
  their own terminal, with `claude` and `/login`; the usage is theirs, under their own agreement with Anthropic. The
  environment, an API key included, passes to `claude` without Arden Code reading it.
- It shows the 5-hour and weekly limits the person's own Claude Code reports about their own plan (ADR 0043), checked
  against the terms on 2026-10-09. The terms bar products from offering Claude.ai usage limits, that is, letting people
  spend a plan through them; Arden Code offers no plan of its own, asks only its own Claude Code, and never sees a
  token. Check this line again before a release.
- It bundles no Anthropic SDK or copy of Claude Code. The supplied agent artwork is a separate policy decision below.
- The agent is called **Claude**. **Claude Code** names the program, in plain sentences. About keeps the statement that
  Arden Code is not affiliated with Anthropic or OpenAI.

### Agent artwork: policy changed on 2026-11-11

The maintainer explicitly replaced the internal no-vendor-logo rule, including its written-permission prerequisite,
with [ADR 0064](adr/0064-vendor-logos-for-agent-identification.md). The supplied Claude symbol is eligible for the agent
menu and session identity, unchanged, as a narrow exception to the neutral palette. The app now renders that
original SVG as an image in those places; it does not reconstruct or recolor its paths.

The earlier policy followed a check on 2026-10-10 of
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) and the
[Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines); ADR 0044 and its council report preserve
that historical reasoning. This override changes Arden Code's policy, not those external terms. No vendor permission
grant or original download URL was supplied or verified. The artwork is excluded from the repository's MIT grant,
and external branding rights remain a separate release consideration.

## OpenAI: Codex

The session driver is not implemented yet. The accepted design uses the person's own `codex app-server`, with
CLI-owned sign-in and no credential-file access by Arden Code
([ADR 0065](adr/0065-codex-as-a-first-class-agent.md), [the councils](research/codex-support-councils.md)). This is not a
claim that a real Codex handshake or signed-in reply has been verified, or a fresh check of OpenAI's terms.

The maintainer-supplied `chatgpt-logo.svg` and PNG are eligible to identify Codex under ADR 0064. The agent remains
named Codex; the supplied filename does not establish an official Codex-specific logo. Its original download URL
and permission status have not been verified. Keep the artwork unchanged and outside the MIT grant, and retain the
non-affiliation disclaimer.
