# 0003. MIT license, zero telemetry, hands off credentials

- Status: Accepted
- Date: 2026-09-29

## Context

The project is a personal open-source tool: anyone may use it. It works alongside products from
Anthropic and OpenAI, whose names are trademarks and whose terms for third-party tools change.

In 2026 Anthropic's rules about using Claude subscriptions from other tools changed several times.
Running the user's own `claude` CLI remains ordinary use.

## Decision

- **License:** MIT for everything, brand assets included. Bundled fonts keep the SIL Open Font License 1.1, and third-party notices are generated automatically.
- **Contributions:** no contributor agreement and no sign-off requirement while the project is solo.
- **Zero telemetry:** the only automatic network request is the update check.
- **Credentials:** Arden Code never reads, stores or forwards vendor credentials or tokens. Each vendor's own CLI handles sign-in.
- **Vendor names:** plain text only, no vendor logos or brand colors, until each vendor's brand guidelines have been reviewed.
- **Disclaimer:** "Not affiliated with Anthropic or OpenAI" appears in About and in the README.

## Consequences

- Forks may reuse the logo. That's accepted.
- There is no usage data. Improvements rely on issue reports and user-exported diagnostics.
- Vendor integrations stay compliant because they use the vendors' own sign-in paths.
