import { markIconSvg } from "./icons.ts";
import { rasterize } from "./test-utils.ts";

/** Share of the drawn pixels that are neither solid nor empty, that is, blurry. */
function blurriness(svg: string, size: number): number {
  const { pixels } = rasterize(svg, size);
  let drawn = 0;
  let blurry = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i] ?? 0;
    if (alpha === 0) continue;
    drawn++;
    if (alpha < 250) blurry++;
  }
  return blurry / drawn;
}

describe("markIconSvg", () => {
  it("draws the mark inside the icon, without touching the edges of large icons", () => {
    const { pixels, width } = rasterize(markIconSvg(256), 256);
    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3] ?? 0;

    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(255, 255)).toBe(0);
    expect(alphaAt(128, 128)).toBe(255); // the middle cell
  });

  it("snaps the grid to whole pixels at small sizes, so the icons stay sharp", () => {
    for (const size of [16, 20, 24, 32]) {
      // The same mark scaled smoothly, for comparison.
      const smooth = markIconSvg(size, { snap: false });
      const snapped = markIconSvg(size);

      expect(blurriness(snapped, size), `${size}px`).toBeLessThan(blurriness(smooth, size) * 0.6);
    }
  });

  it("keeps the whole mark visible at 16 px", () => {
    const { pixels, width } = rasterize(markIconSvg(16), 16);
    const solid = (x: number, y: number) => (pixels[(y * width + x) * 4 + 3] ?? 0) > 200;
    let drawn = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (solid(x, y)) drawn++;

    // The checkerboard covers 7 of 15 cells, about 47% of the mark's box (which is 15 x 15 here).
    expect(drawn).toBeGreaterThan(90);
    expect(drawn).toBeLessThan(140);
  });
});
