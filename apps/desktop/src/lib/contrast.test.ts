import { contrastRatio, oklchToSrgb, parseColor } from "./contrast";

const white = oklchToSrgb(parseColor("oklch(1 0 0)"));
const black = oklchToSrgb(parseColor("oklch(0 0 0)"));

describe("contrastRatio", () => {
  it("is 21:1 for black on white and 1:1 for a color on itself", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("does not depend on which color is the text", () => {
    const gray = oklchToSrgb(parseColor("oklch(0.5 0 0)"));

    expect(contrastRatio(gray, white)).toBeCloseTo(contrastRatio(white, gray), 10);
  });
});

describe("oklchToSrgb", () => {
  // Reference values: oklch(0.5 0 0) is the mid gray #636363, oklch(0.205 0 0) is #171717, and
  // oklch(0.577 0.245 27.325) is the red #E7000B (shadcn's destructive color).
  it("converts neutral grays", () => {
    expect(oklchToSrgb(parseColor("oklch(0.5 0 0)")).map((v) => Math.round(v * 255))).toEqual([
      99, 99, 99,
    ]);
    expect(oklchToSrgb(parseColor("oklch(0.205 0 0)")).map((v) => Math.round(v * 255))).toEqual([
      23, 23, 23,
    ]);
  });

  it("converts a saturated color", () => {
    const [r, g, b] = oklchToSrgb(parseColor("oklch(0.577 0.245 27.325)")).map((v) =>
      Math.round(v * 255),
    );

    expect(Math.abs((r ?? 0) - 0xe7)).toBeLessThanOrEqual(2);
    expect(Math.abs((g ?? 0) - 0x00)).toBeLessThanOrEqual(2);
    expect(Math.abs((b ?? 0) - 0x0b)).toBeLessThanOrEqual(3);
  });
});

describe("parseColor", () => {
  it("reads lightness, chroma, hue and alpha", () => {
    expect(parseColor("oklch(0.737 0.126 47.7)")).toEqual({
      l: 0.737,
      c: 0.126,
      h: 47.7,
      alpha: 1,
    });
    expect(parseColor("oklch(1 0 0 / 34%)")).toEqual({ l: 1, c: 0, h: 0, alpha: 0.34 });
  });

  it("rejects colors it does not understand", () => {
    expect(() => parseColor("#fff")).toThrow(/oklch/);
  });
});
