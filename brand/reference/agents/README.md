# Vendor logo originals

These originals were supplied by the maintainer from Downloads for the Codex support work:

- `chatgpt-logo.svg`
- `chatgpt-logo.png`
- `claude-symbol.svg`
- `claude-symbol.png`

The files are copied byte-for-byte, with their original names. The copies in Downloads remain.
Their original download URLs and any permission grants have not been recorded.

These are third-party assets, not Arden Code's own brand assets. No MIT license or
permission to use a vendor's marks is granted by this repository.

[ADR 0064](../../../docs/adr/0064-vendor-logos-for-agent-identification.md) accepts the maintainer's
explicit override of the old no-vendor-logo rule in ADRs 0003 and 0044. Use `claude-symbol.svg` to
identify Claude and the supplied `chatgpt-logo.svg` artwork to identify Codex; keep the PNG originals
too. The filename does not rename the agent ChatGPT or establish an official Codex-specific logo.

The files are eligible for app use under that internal policy, without reinstating the superseded
written-permission prerequisite. No external permission grant is asserted. The app imports the
Claude SVG as an image for its agent controls and session identity. The OpenAI artwork now identifies
the initial working read-only Codex driver. Its black ink has a light UI backing for contrast in both
themes; the source artwork is not recolored or rewritten. Readiness and a real driver, not the
artwork import, determine whether Codex can be selected.

Keep the artwork, proportions and colors intact. Use a contrasting neutral surface when needed,
not CSS recoloring or inversion. Do not pass these files through the Arden Code brand generator.
Keep visible agent names, accessible control labels and the non-affiliation disclaimer.
