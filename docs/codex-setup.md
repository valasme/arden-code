# Connect Codex to Arden Code

Codex uses the person's own locally installed **Codex CLI**. It is not a Hermes connector or an
MCP server, and Arden does not borrow Hermes's model credentials.

## Current status

The initial [readiness #195](https://github.com/valasme/arden-code/issues/195) and
[read-only sessions #196](https://github.com/valasme/arden-code/issues/196) slices are implemented
locally on `feat/codex-support`. A ready Codex CLI is selectable in a new or empty session. Real
signed-in file reading and saved-session resume were verified on Windows; see the
[native evidence](reviews/0195-0196-codex-sessions.md).

This is not completion of [spec #193](https://github.com/valasme/arden-code/issues/193). Interactive
approvals/questions, broader native controls and the remaining capability/platform gates are
separate tickets. No commit, PR CI, merge or production release is implied by local verification.

Older Arden builds had installation detection without a Codex driver. Updating or signing into the
CLI could not make their dropdown gain a working Codex option: rebuild and restart Arden too. The
earlier signed-out research copy was isolated in scratch; it is not the actual installed CLI used
by the subsequent signed-in verification.

## 1. Install the CLI

In your own terminal, the official npm installation route is:

```powershell
npm install -g @openai/codex
codex --version
```

For a reproducible installation matching the tested candidate, replace the first command
with `npm install -g @openai/codex@0.167.1`. This is a tested version, not a minimum-version claim or a declaration that all
Arden features already support it. Use [OpenAI's setup instructions](https://developers.openai.com/codex/cli)
if you prefer another official installer.

If a newly installed command is not found, open a fresh terminal after installation. Arden also
inherits PATH when it starts, so restart it before Settings → Agents → Look again.

## 2. Sign in through Codex

Check `codex login status` first. If it already reports that you are signed in, skip a new login;
Arden uses that same CLI-owned account. Otherwise:

```powershell
codex login
codex login status
```

Complete the browser flow yourself. The recommended path for subscription access is signing in with
your ChatGPT account. Codex also supports API-key authentication, with separate API billing; that is
a choice handled by Codex, not by Arden. Do not paste API keys, tokens or browser verification codes
into this conversation or Arden.

See [OpenAI's authentication documentation](https://developers.openai.com/codex/auth.md).
The presence of a model in the catalog is not proof that the signed-in account can use it.

## 3. Let Arden launch the local connection

Run the rebuilt Arden app, choose Codex in a new or empty session, and send the first message.
Arden:

1. Find the actual Codex executable safely.
2. Start `codex app-server` as a supervised child, in the intended trusted project.
3. Negotiate `initialize` / `initialized` over stdin/stdout.
4. Start or resume the session's Codex thread and stream its turns into Arden.

The initial policy is the native read-only sandbox with network access disabled for sandboxed
commands and `approvalPolicy: never`: failures are returned to the model, not escalated or granted.
Arden confirms the effective sandbox and does not label it as Claude's Manual mode. Unexpected
interactive authority requests fail closed. Editing and richer native choices remain follow-up
work; the CLI's configured default model is used.

Codex does not receive Claude's Ultrathink preparation or the shared file-mention picker. Plain
messages are preserved, including literal paths; verified native skill/file-input controls remain
in #200.

You do not manually keep an app-server terminal open, expose a TCP/WebSocket port, install an MCP
adapter or add a Hermes connector. Codex itself owns sign-in and model/network access; Arden owns
the local session controls and never reads credential files or receives tokens from you.

The release-matched details and remaining verification gaps are in
[the research](research/codex-app-server.md). The canonical implementation work is tracked by the
[spec and its tickets](specs/codex-support-tickets.md).

If a standalone `target/debug/arden-code.exe` tries to contact the development server after a
workspace test run, rebuild with `pnpm build:debug` before launching it. Cargo's ordinary test build
can replace that path with a dev-server build; the bundled debug build must come last. `pnpm dev`
is the normal alternative when intentionally working with the development server.
