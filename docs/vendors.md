# Vendors

What the vendors' terms say about a tool like Arden Code, and how Arden Code keeps to them. The terms changed several
times in 2026, so each section names the date it was checked. Check again before a release, and when a vendor
announces a change.

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
- It never signs in, never offers a sign-in, and never reads, stores or passes on a token. The person signs in in
  their own terminal, with `claude` and `/login`; the usage is theirs, under their own agreement with Anthropic. The
  environment, an API key included, passes to `claude` without Arden Code reading it.
- It shows the 5-hour and weekly limits the person's own Claude Code reports about their own plan (ADR 0043), checked
  against the terms on 2026-10-09. The terms bar products from offering Claude.ai usage limits, that is, letting people
  spend a plan through them; Arden Code offers no plan of its own, asks only its own Claude Code, and never sees a
  token. Check this line again before a release.
- It ships nothing of Anthropic's: no SDK and no copy of Claude Code.
- The agent is called **Claude**. **Claude Code** names the program, in plain sentences. There is no Anthropic logo or
  brand color in the app (ADR 0003), and About says Arden Code is not affiliated with Anthropic or OpenAI.
- Claude's icon in the agent menu is Lucide's bot, not Anthropic's mark (ADR 0044). Checked on 2026-10-10 against the
  [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page ("Any other use of Anthropic's
  names or logos … requires our written permission") and the
  [Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines) (only in materials Anthropic approved
  beforehand, unchanged). The mark comes in only with Anthropic's written permission.

## OpenAI: Codex

Not integrated yet. This section is written with the Codex driver.
