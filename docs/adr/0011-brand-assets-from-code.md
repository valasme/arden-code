# 0011. Brand assets generated from code

- Status: Accepted
- Date: 2026-09-29

## Context

The original logo was an AI-generated bitmap, with a grain texture and soft edges. Analysis showed a
geometric construction:

- **Mark:** a 3 × 5 checkerboard grid, cells 1.6 : 1, outer corner radius ≈ 0.28 H, and joins between diagonal cells curved with radius ≈ 0.2 H, except the top-right join, which stays open.
- **Wordmark:** Lora Regular (0.77 pixel overlap versus 0.64 for the next-best font).

Icons, installers and README images need crisp vectors at every size. Figma is not used. Affinity 3.3
has JavaScript scripting and an MCP server, but it is a GUI tool.

## Decision

- **Source of truth:** a parametric generator in `@arden/brand` (`pnpm brand:build`).
  - It builds the mark as a single vector shape and sets the wordmark as outlines.
  - It renders PNGs with resvg, with pixel-snapped versions at small sizes.
  - It builds a hand-tuned multi-size ICO, installer bitmaps, GitHub images and React components.
- **Wordmark treatment:** "Arden Code", both words in Lora Regular with the same ink, −1% letter-spacing.
- **Checks:** a pixel test against the reference image, and CI verification that outputs are current.
- **Affinity:** an Affinity document built through its MCP server is a sketchbook for visual exploration. Changes are carried back into the generator's parameters.

## Consequences

- Assets are reproducible and consistent.
- Design tweaks happen by changing parameters, not by hand-editing files.

## What was built (ticket 5)

- `brand/src/affinity.ts` turns the generated files into an Affinity script: it reads every SVG master and the SVG each image is rendered from (`rasterSources` in `assets.ts`), turns arcs and quadratic curves into cubic ones, adds swatches of plan §8.2's colors and a type sample in Lora outlines, and writes `brand/assets/affinity/build-brand-library.js` with the library inside it as data. `pnpm brand:build` writes it and `brand:check` keeps it current, so the Affinity document can never show an older brand than the files.
- The script makes a new document with 24 named artboards. Logos made for dark backgrounds sit on the dark theme's background, as a separate layer named "Backdrop (not part of the file)".
- It was run through Affinity's MCP server (`execute_script`, checked with `render_spread`), saved as `brand/affinity/Arden Code brand library.af` with a `preview.jpg`, and saved to Affinity's Scripts Library as "Arden Code: Brand library". The library tool has no categories, so the title carries the name.
- Affinity's MCP scripts may only touch the Desktop, and only when file access is allowed in Affinity's settings. It was not allowed here, so the document was saved through Affinity's own Save As to the Desktop and copied into `brand/affinity/`.
