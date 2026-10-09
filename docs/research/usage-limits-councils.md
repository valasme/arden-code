# Usage limits: the councils

- Date: 2026-10-09
- Input: the maintainer's request (below), [the research](usage-limits.md), ADRs 0003, 0027, 0033, 0038 and 0039,
  [the vendors page](../vendors.md), and the codebase at `2e21e69`.
- Method: as in [the Claude councils](claude-agent-councils.md), each question was weighed from five sides: product (P),
  experience (E), architecture (A), reliability (R) and delivery (D). Where a side objected, the objection is kept with
  what settled it. The maintainer answered the first question and asked for the rest to follow the councils, so each
  question below has a verdict, and the interview's recommendations were weighed as the first option.

## The request

"We need something to show our usage in Claude chat." Asked what usage means, the maintainer answered: "the usage
itself is the 5 hour limit and weekly limit."

## Round 1

### Q1. What is shown

Options: **(a)** the 5-hour and weekly limits of the person's Claude plan; **(b)** how full a session's context window
is; **(c)** what a turn cost.

- **Product:** P1 the maintainer chose (a), and only its two windows.
- **Experience:** E2 Claude Code's own status-line examples show the same two figures, "5h" and "7d".
- **Architecture:** A2 per-model weekly windows (`seven_day_opus`, `seven_day_sonnet`, `model_scoped`) and extra usage
  are reported too; each is one more row to keep up with as Anthropic changes its plans.
- **Delivery:** D1 (b) and (c) are separate features, already on ADR 0039's "later" list.

**Verdict: (a), the two windows.** Per-model windows, extra usage, context and cost are left for later.

### Q2. What it is called

- **Architecture:** A1 "usage" already means telemetry in ADR 0003 ("There is no usage data"), and "chat" is a word the
  glossary avoids: the place is the session view. A1 "rate limit" is the API's word for requests per minute, which is
  something else.
- **Experience:** E5 Claude Code says "limit" ("You've hit your limit") and names the windows "5-hour" and "weekly".
- **Product:** P4 a Codex plan has windows too; the term should not belong to one vendor.

**Verdict:** the term is **Usage limit**: how much of an agent the person's plan allows within a window of time, such as
five hours or a week, as the agent CLI reports it. _Avoid_: quota, rate limit, usage (alone). The windows are the
**5-hour limit** and the **weekly limit**.

### Q3. Where the numbers come from

Options: **(a)** only `rate_limit_event`, which Claude Code sends during a turn; **(b)** the `get_usage` control request,
with (a) alongside; **(c)** the status line's `rate_limits`; **(d)** Anthropic's usage endpoint, called by Arden Code.

- **Reliability:** R1 (a) is public and stable, but names one window at a time and may carry no percentage on an
  ordinary turn (not yet seen signed in). R1 (b) is the only way to have both windows, with their reset times, before
  any turn. **R1 dissents** to (b): the SDK marks it experimental and says not to rely on it yet, and ADR 0038 says
  everything the driver uses is documented. Settled: it is documented, as experimental; the meter is information, not
  control, so a change can only take the figures away, never stop a reply. Parsing is tolerant, an error or an unknown
  shape reads as "not reported", and the fixture and the signed-in test (ADR 0038) catch a change. ADR 0043 records the
  exception.
- **Architecture:** A4 (c) changes the person's Claude Code settings, which ADR 0038 rules out. A4 (d) needs the
  person's token, which ADR 0003 forbids. A3 (b) travels on the pipes the driver already speaks, beside `initialize`.
- **Product:** P2 without (b), a fresh start of Arden Code shows nothing until the first reply, which is the moment the
  person wanted to know.

**Verdict: (b), with (a) alongside.** `get_usage` gives both windows; `rate_limit_event` updates the window it names
while a reply runs, and marks a window Claude Code says is near or at its limit.

### Q4. The vendor's terms

- **Product:** P3 the vendors page bars products from *offering* Claude.ai sign-in or its usage limits, that is, letting
  people spend their plan through the product without Anthropic's approval. Arden Code already runs the person's own
  Claude Code on their own plan (ADR 0003, ADR 0038); showing what that Claude Code reports about the plan offers
  nothing new.
- **Architecture:** A4 Arden Code reads two percentages and two times, never a token, and asks only through Claude
  Code's own protocol.
- **Reliability:** R4 the terms changed several times in 2026.

**Verdict:** shown, with a dated note on the vendors page, checked again before a release. If the terms come to forbid
it, the meter is removed and nothing else depends on it.

### Q5. Claude only, or every agent

- **Product:** P4 Codex reports its own limits, but is not integrated.
- **Architecture:** A5 the shape (a window, a percentage, a reset time) belongs to every agent; reading it belongs to
  each driver.
- **Delivery:** D1 only Claude is built now.

**Verdict:** the term and the shape are the agent's; only Claude's driver fills them for now.

## Round 2

| # | Question | Verdict and why |
|---|---|---|
| 6 | When Arden Code asks | A3, D5: (1) once per start of Arden Code, in the Claude Code it already starts in the Playground to hear the slash commands (ADR 0042): `get_usage` follows `initialize`, so no extra process; (2) when a Claude reply ends, on that session's own Claude Code; (3) on Look again in Settings → Agents; (4) when the window comes back into focus and the last answer is more than 5 minutes old, on a running Claude Code or, with none, on a listening one in the Playground. R2: never more than once a minute, whatever asks. P2: (4) covers the person who also uses Claude Code in a terminal. Always `skip_behaviors`, so Claude Code reads no transcripts. |
| 7 | Where it shows | E1: the status bar, as text, beside the version: "5-hour 42% · Weekly 18%". The status bar only says things (ADR 0033). E1: Settings → Agents, under Claude Code, adds a Usage limits row with both windows, each with its percentage and its reset time, and Look again refreshes it with detection. P1: nothing in the session view; the limits are the account's, not the session's, so they show whatever session is open, a Demo agent session included. |
| 8 | A window at or near its limit | E2: from 80%, or when Claude Code says `allowed_warning`, the figure takes the foreground color in medium weight. At 100%, or `rejected`, it says when the window resets instead: "5-hour limit reached, resets 15:10". R3: the reply already shows Claude Code's own limit error when a turn is refused; nothing more is added to it, and no notification is sent. E3: the status bar is not a live region (ADR 0027); the reply's error is what is announced. |
| 9 | A reset time that has passed | R2: the window shows 0% with no reset time until the next answer, which the next reply or focus brings. |
| 10 | When there is nothing to show | E5: with no Claude Code, signed out, an API key or a cloud provider (`rate_limits_available: false`), or a Claude Code that does not know `get_usage` and has sent no `rate_limit_event`, the status bar shows nothing, and Settings → Agents says "Claude Code reports no usage limits for this sign-in" or, for an error, "Update Claude Code to see usage limits". A window with a null percentage is left out. |
| 11 | A setting | P5, A4: Settings → Agents, "Show usage limits" [on]. Off, Arden Code neither asks nor shows. Hiding the status bar does not stop the asking, since Settings → Agents still shows them. |
| 12 | Storage and privacy | A4: kept in memory only, never written to disk: a figure from the last start would be stale. R4: the log keeps the frame type at debug level, as for every frame (ADR 0038). Plan section 13 says Claude Code asks Anthropic, with the person's own sign-in, when Arden Code asks it for usage limits. |
| 13 | Numbers and times | E4: whole percentages, tabular numbers. A reset today shows the time ("15:10"); a later one shows the weekday and time ("Tue 09:00"), in the regional format setting. Claude Code's 0–100 `get_usage` scale is used as it is; `rate_limit_event`'s `utilization`, a fraction, is multiplied by 100. |
| 14 | An ADR | Hard to reverse (a documented-but-experimental request in the driver), surprising (why not only the public frame), and a real trade-off: **ADR 0043**. |
| 15 | Tests | D3: the highest seams the codebase already has. Rust: the Claude driver run by the store with a script of frames (ADR 0038), for `get_usage` answers, errors and `rate_limit_event`; the signed-out probe's answer kept as a fixture; the stand-in `claude` answering `get_usage` for the end-to-end test. The page: the app tests with the IPC mocked, as `claude.test.tsx` does, and the status bar's and Settings → Agents' own tests. One end-to-end test, run 10 times before merging (CLAUDE.md). |
| 16 | Branches and tickets | D1, D2: one branch and one pull request, with one commit for the documents and one for each ticket, worked in dependency order. |
