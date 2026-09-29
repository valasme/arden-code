import { buildLogoFiles } from "./logo-files.ts";
import { rasterize, type Raster } from "./test-utils.ts";

const shapes = ["mark", "wordmark", "logo-horizontal", "logo-stacked"] as const;
const variants = ["color-on-light", "color-on-dark", "black", "white"] as const;

const files = buildLogoFiles();

/** Columns and rows that hold ink of one color, as a bounding box in pixels. */
function inkBox(raster: Raster, matches: (r: number, g: number, b: number) => boolean) {
  let [left, top, right, bottom] = [raster.width, raster.height, -1, -1];
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const i = (y * raster.width + x) * 4;
      const alpha = raster.pixels[i + 3] ?? 0;
      if (
        alpha < 200 ||
        !matches(raster.pixels[i] ?? 0, raster.pixels[i + 1] ?? 0, raster.pixels[i + 2] ?? 0)
      )
        continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

const isOrange = (r: number, g: number, b: number) => r > 200 && g > 120 && g < 170 && b < 130;
const isBrown = (r: number, g: number, b: number) => r < 130 && g < 90 && b < 70;

describe("the logo files", () => {
  it("has each shape in each color variant", () => {
    const expected = shapes.flatMap((shape) =>
      variants.map((variant) => `${shape}-${variant}.svg`),
    );

    expect(Object.keys(files).toSorted()).toEqual(expected.toSorted());
  });

  it("uses the plan's colors", () => {
    expect(files["mark-color-on-light.svg"]).toContain('fill="#EA9061"');
    expect(files["wordmark-color-on-light.svg"]).toContain('fill="#58382B"');
    expect(files["wordmark-color-on-dark.svg"]).toContain('fill="#F2E8E1"');
    expect(files["logo-horizontal-color-on-dark.svg"]).toContain('fill="#EA9061"');
    expect(files["logo-horizontal-color-on-dark.svg"]).toContain('fill="#F2E8E1"');
    expect(files["logo-stacked-black.svg"]).not.toMatch(/fill="#(?!000000)/);
    expect(files["logo-stacked-white.svg"]).not.toMatch(/fill="#(?!FFFFFF)/);
  });

  it("uses the same ink for both words", () => {
    const wordmark = files["wordmark-color-on-light.svg"] ?? "";

    expect(wordmark.match(/fill="/g)).toHaveLength(1);
  });

  it("is made of outlines only, so it needs no font", () => {
    for (const [name, svg] of Object.entries(files)) {
      expect(svg, name).not.toMatch(/<text|font-family/);
    }
  });

  it("puts the mark to the left of the wordmark, centered on the same line", () => {
    const raster = rasterize(files["logo-horizontal-color-on-light.svg"] ?? "", 1200);
    const mark = inkBox(raster, isOrange);
    const wordmark = inkBox(raster, isBrown);

    expect(mark.right).toBeLessThan(wordmark.left);
    expect(Math.abs(mark.centerY - wordmark.centerY) / raster.height).toBeLessThan(0.03);
  });

  it("puts the mark above the wordmark, centered on the same axis", () => {
    const raster = rasterize(files["logo-stacked-color-on-light.svg"] ?? "", 1200);
    const mark = inkBox(raster, isOrange);
    const wordmark = inkBox(raster, isBrown);

    expect(mark.bottom).toBeLessThan(wordmark.top);
    expect(Math.abs(mark.centerX - wordmark.centerX) / raster.width).toBeLessThan(0.02);
  });

  it("fits each file tightly around its ink", () => {
    for (const [name, svg] of Object.entries(files)) {
      const raster = rasterize(svg, 800);
      const ink = inkBox(raster, () => true);
      expect(ink.left, `${name} left`).toBeLessThanOrEqual(1);
      expect(ink.top, `${name} top`).toBeLessThanOrEqual(1);
      expect(raster.width - 1 - ink.right, `${name} right`).toBeLessThanOrEqual(2);
      expect(raster.height - 1 - ink.bottom, `${name} bottom`).toBeLessThanOrEqual(2);
    }
  });
});
