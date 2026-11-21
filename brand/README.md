# Arden Code brand

Every logo file is generated from code. Do not edit the files in `assets/` by hand: change the
generator in `src/` and run:

```powershell
pnpm brand:build
```

This writes the SVG masters to `assets/svg/` and the outlines the app's `<Logo />`, `<Mark />` and
`<Wordmark />` components draw. Output is deterministic, so running it twice gives identical files.

## The logo

- **Mark:** a 3 × 5 checkerboard of rounded cells, each 1.6 times as wide as it is high. Outer corners
  have a radius of 0.28 of a cell height. Cells that touch at a corner are joined by a curve of 0.2 of a
  cell height. The top-right join is left open on purpose. The mark is one merged vector shape.
- **Wordmark:** "Arden Code" in Lora Regular, converted to outlines, with letter-spacing of −1%. Both words
  use the same ink.
- **Lockups:** horizontal (mark, then words), stacked (mark above words), and the mark alone. The mark alone is the app icon.

## Files

`assets/svg/<shape>-<variant>.svg`, where the shape is `mark`, `wordmark`, `logo-horizontal` or
`logo-stacked`, and the variant is one of:

| Variant | Use it on | Mark | Wordmark |
|---|---|---|---|
| `color-on-light` | white and light backgrounds | `#EA9061` | `#58382B` |
| `color-on-dark` | dark backgrounds | `#EA9061` | `#F2E8E1` |
| `black` | one-color printing, light backgrounds | `#000000` | `#000000` |
| `white` | one-color printing, dark or photo backgrounds | `#FFFFFF` | `#FFFFFF` |

In the app, use the components in `apps/desktop/src/components/brand`. They take their colors from the
theme (`--brand` and `--brand-wordmark`), so they follow light and dark automatically.

## Usage rules

**Clear space.** Keep at least one cell height (one fifth of the mark's height) free on every side.

**Minimum size.** The mark alone: 16 px high. The horizontal logo: 24 px high. The stacked logo: 64 px wide.
Below that the letters stop being legible. The app icon is drawn separately at small sizes so it stays sharp.

**Colors.**
- The orange `#EA9061` is for graphics only, **never for text**. It has 2.4:1 contrast on white.
- Use `color-on-light` on white or light backgrounds, and `color-on-dark` on dark ones.
- Use `black` or `white` when only one color is available.

**Don't.**
- Stretch, squash, rotate or skew the logo.
- Recolor it, add gradients, shadows, outlines or other effects.
- Close the open join in the mark, or change the cell proportions or the corner radii.
- Retype the words in another font, or change the space between the mark and the words.
- Split the mark from the words in a way the lockups don't already offer.
- Put it on busy photos or on backgrounds close to its own colors.

## How the checks work

- `src/mark.test.ts` draws the mark and checks the cells, the closed and open joins and the rounded corners.
- `src/reference.test.ts` compares the mark with the original logo bitmap (`reference/original-logo.png`).
  The two must overlap by at least 95%. The original is a low-resolution image with soft, grainy edges,
  so the generated mark currently scores about 0.950. There is very little headroom: if this test fails
  after a change, the change moved the mark away from the original, so look at the parameters first.
- `src/wordmark.test.ts` checks the letter-spacing and that the letterforms match the original's serif
  (Lora scores about 0.95; the closest other serif installed with Windows scores 0.69).
- `src/logo-files.test.ts` checks every file: colors, composition, tight edges, and no live text.

## The Affinity library: a sketchbook, not the source of truth

`brand/affinity/Arden Code brand library.af` is an Affinity document of the whole kit, for trying ideas by
eye: an artboard for every file in `assets/svg/` and every image made from the logo, the light and dark
colors as swatches, and Lora as outlines (so it needs no font installed). `preview.jpg` shows it.

It is made by a script, which `pnpm brand:build` writes from the same files as everything else:
`assets/affinity/build-brand-library.js`. The script is also in Affinity's Scripts Library as
**Arden Code: Brand library** (Window › Scripting › Scripts Library); click it there to get a fresh document.
After the script changes, put the new one in the library again.

**The rule.** Nothing drawn in Affinity flows back on its own. When a change looks right there, make it in
the generator instead (the parameters in `src/mark.ts`, the colors in `src/colors.ts`, the wordmark in
`src/wordmark.ts`), run `pnpm brand:build`, and remake the document from the new script. CI fails when the
script is out of date with the generator, as it does for every other brand file.

To remake the saved document: run the script in Affinity, save it with File › Save As to the Desktop
(Affinity's scripts can only reach the Desktop, and only when file access is allowed in its settings), then
copy it into `brand/affinity/`. Through Affinity's MCP server (Settings › Model Context Protocol, at
`http://[::1]:6767/sse`) an agent can run the script, render it to check it, and save it to the library.

## Licenses

The brand assets are released under the repository's [MIT license](../LICENSE).
The wordmark is set in **Lora**, © The Lora Project Authors, under the
[SIL Open Font License 1.1](fonts/OFL.txt). The logo files contain outlines of the letters, not the font,
and the font is not shipped with the app.
