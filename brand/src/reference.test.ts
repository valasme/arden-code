import { readFileSync } from "node:fs";

import { PNG } from "pngjs";

import { buildMark } from "./mark.ts";
import { alphaAt, rasterize } from "./test-utils.ts";

/** Pixels of the original logo that are the mark's orange (the mark is the left part of the image). */
function referenceMask() {
  const image = PNG.sync.read(
    readFileSync(new URL("../reference/original-logo.png", import.meta.url)),
  );
  const markAreaWidth = 150;
  const isOrange = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    const [r, , b] = [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
    return r - b > 60;
  };
  let [left, top, right, bottom] = [markAreaWidth, image.height, 0, 0];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < markAreaWidth; x++) {
      if (!isOrange(x, y)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const width = right - left + 1;
  const height = bottom - top + 1;
  const mask = Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) => isOrange(left + x, top + y)),
  );
  return { width, height, mask };
}

describe("the mark against the original reference image", () => {
  it("overlaps the original by at least 95%", () => {
    const reference = referenceMask();
    const mark = buildMark();
    // Stretch the mark over the reference's bounding box, then count pixels in both or either.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${reference.width}" height="${reference.height}" viewBox="0 0 ${mark.width} ${mark.height}" preserveAspectRatio="none"><path d="${mark.path}"/></svg>`;
    const raster = rasterize(svg, reference.width);

    let both = 0;
    let either = 0;
    for (let y = 0; y < reference.height; y++) {
      for (let x = 0; x < reference.width; x++) {
        const ours = alphaAt(raster, x, y) > 127;
        const theirs = reference.mask[y]?.[x] ?? false;
        if (ours && theirs) both++;
        if (ours || theirs) either++;
      }
    }

    const overlap = both / either;
    expect(overlap, `overlap with the original: ${overlap.toFixed(4)}`).toBeGreaterThanOrEqual(
      0.95,
    );
  });
});
