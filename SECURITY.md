# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, through GitHub's private vulnerability reporting:
[report a vulnerability](https://github.com/valasme/arden-code/security/advisories/new).

Please don't open a public issue or pull request for a security problem. Include what you found, how
to reproduce it, and the version of Arden Code you tested. This is a personal open-source project, so
there is no formal response time, but reports are read and taken seriously.

## Supported versions

Arden Code is pre-alpha. Only the latest commit on `main` is supported.

## What Arden Code protects

- **Untrusted agent output.** Markdown renders without raw HTML, remote images are blocked, and unusual link types need confirmation.
- **Least privilege.** A strict Content Security Policy, minimal Tauri capabilities per window, and Tauri's isolation pattern.
- **No credentials.** Arden Code never reads, stores or forwards sign-in tokens. Vendor CLIs handle sign-in.
- **Supply chain.** Package releases must be two days old before they are installed, install scripts need approval, and CI runs `cargo-deny` and CodeQL.

The full picture is in [the plan, section 12](docs/PLAN.md#12-security) and
[ADR 0020](docs/adr/0020-security-and-supply-chain.md).
