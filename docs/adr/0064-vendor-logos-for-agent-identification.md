# 0064. Vendor logos for agent identification

- Status: Accepted
- Date: 2026-11-11
- Supersedes the vendor-logo rule of [0003](0003-license-privacy-and-vendor-posture.md) and the
  no-vendor-logo/written-permission prerequisite of
  [0044](0044-permission-modes-the-context-window-and-the-agents-icon.md), not their other decisions.
- Adds an agent-identification artwork exception to the color-use rule of
  [0010](0010-visual-design-system.md).
- Changes plan sections 1, 2, 7.3, 7.5 and 8.3.

## Context

The maintainer supplied ChatGPT/OpenAI and Claude artwork in SVG and PNG, asked for it to be copied
into the project for use as agent logos, and explicitly directed that the previous documentation's
logo ban be overridden. [The councils](../research/codex-support-councils.md) weighed that direction
against recognizable agent controls, asset fidelity, the neutral interface and third-party rights.

The earlier ADR remains the history of the choice; the maintainer is now choosing a different
project policy. No vendor permission grant or original download URL was supplied or verified.

## Decision

- **Use the supplied artwork to identify the agents:** `claude-symbol.svg` for Claude and
  `chatgpt-logo.svg` for Codex, with their PNG originals kept too, under `brand/reference/agents/`.
  The agent is still called Codex; the filename does not rename it ChatGPT or establish that the
  artwork is an official Codex-specific logo.
- **The internal blanket ban is removed.** Arden Code no longer makes obtaining written vendor
  permission a prerequisite imposed by its own design documents. This is the maintainer's project
  decision, not a statement that vendor permission has been obtained or external rights have changed.
- **Limit the exception to agent identification.** Use the artwork in the agent menu and session
  identity. Keep adjacent text and accessible control names; the artwork is decorative when the
  name is already present. Demo keeps its flask. Arden Code's own name, logo and app icon do not change.
- **Keep the supplied artwork intact:** geometry, proportions and colors. Keep byte-identical source
  originals outside the generated Arden Code brand output. Wrapping an SVG for rendering must not
  alter its artwork. Ensure contrast with a neutral surface rather than recoloring or inverting it.
  This is a narrow exception to the neutral-palette rule, not a vendor-colored interface theme.
- **Keep third-party rights distinct.** The vendor artwork is not covered by Arden Code's MIT grant.
  Keep the non-affiliation disclaimer. Record the unknown provenance/permission status honestly;
  the documentation override does not itself establish external authorization.

## Consequences

- The supplied files are eligible for app integration now; the old internal policy is not a blocker.
- UI wiring still needs component and light/dark visual verification. Accepting this ADR does not
  assert that the running app already renders the logos.
- The current plan, vendor-policy notes and asset notes point here rather than perpetuating the old
  ban. Accepted ADR bodies and historical council reports are preserved.
- A release must assess external branding rights separately; neither this repository nor its
  maintainer can grant rights owned by a vendor.
