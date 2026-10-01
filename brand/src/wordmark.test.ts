import { readFileSync } from "node:fs";

import { PNG } from "pngjs";

import { alphaAt, rasterize } from "./test-utils.ts";
import { buildWordmark } from "./wordmark.ts";

describe("the wordmark", () => {
  it("is the words as outlines, with a baseline at y = 0", () => {
    const wordmark = buildWordmark({ fontSize: 100 });

    expect(wordmark.path).toMatch(/^M/);
    expect(wordmark.path).not.toMatch(/text|font/i);
    // Capitals rise above the baseline; nothing in "Arden Code" hangs far below it.
    expect(wordmark.bounds.top).toBeLessThan(-60);
    expect(wordmark.bounds.bottom).toBeLessThan(5);
  });

  it("tightens the letters by 1% of the font size between each pair", () => {
    const fontSize = 100;
    const natural = buildWordmark({ fontSize, letterSpacing: 0 });
    const tightened = buildWordmark({ fontSize });

    // "Arden Code" has 10 characters, so 9 gaps fall between the first and the last ink.
    const removed =
      natural.bounds.right - natural.bounds.left - (tightened.bounds.right - tightened.bounds.left);
    expect(removed).toBeCloseTo(9 * 0.01 * fontSize, 1);
  });

  it("starts at the requested position", () => {
    const wordmark = buildWordmark({ fontSize: 100, x: 500, y: 300 });

    // The "A" has a slightly negative left side bearing, so its ink starts a hair before the origin.
    expect(wordmark.bounds.left).toBeGreaterThan(498);
    expect(wordmark.bounds.left).toBeLessThan(510);
    expect(wordmark.bounds.top).toBeLessThan(300 - 60);
    expect(wordmark.bounds.top).toBeGreaterThan(300 - 90);
  });

  it("matches the letterforms of the original logo", () => {
    // The original spells "Arden" in a serif. Set "Arden" in Lora over the same box and compare ink.
    // Other serifs score far lower (Sitka 0.69, Georgia 0.42, Times 0.27), so this catches a wrong font.
    const image = PNG.sync.read(
      readFileSync(new URL("../reference/original-logo.png", import.meta.url)),
    );
    const isBrown = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      const [r, g, b] = [image.data[i] ?? 255, image.data[i + 1] ?? 255, image.data[i + 2] ?? 255];
      return r < 140 && g < 110 && r - b > 15;
    };
    let [left, top, right, bottom] = [image.width, image.height, 0, 0];
    for (let y = 0; y < image.height; y++) {
      for (let x = 150; x < image.width; x++) {
        if (!isBrown(x, y)) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    const width = right - left + 1;
    const height = bottom - top + 1;

    const arden = buildWordmark({ text: "Arden", fontSize: 100, letterSpacing: 0 });
    const inkWidth = arden.bounds.right - arden.bounds.left;
    const inkHeight = arden.bounds.bottom - arden.bounds.top;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${arden.bounds.left} ${arden.bounds.top} ${inkWidth} ${inkHeight}" preserveAspectRatio="none"><path d="${arden.path}"/></svg>`;
    const raster = rasterize(svg, width);

    let both = 0;
    let either = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ours = alphaAt(raster, x, y) > 127;
        const theirs = isBrown(left + x, top + y);
        if (ours && theirs) both++;
        if (ours || theirs) either++;
      }
    }
    const overlap = both / either;
    expect(overlap, `overlap with the original: ${overlap.toFixed(4)}`).toBeGreaterThanOrEqual(
      0.85,
    );
  });
});
