import { buildMark } from "./mark.ts";
import { alphaAt, rasterize } from "./test-utils.ts";

// The mark is drawn on a 3 x 5 grid. Cells are 160 wide and 100 high (1.6 : 1), so the mark is
// 480 x 500 units, and a point (x, y) in those units is in column x / 160 and row y / 100.
const scale = 2;
const svgOfMark = () => {
  const mark = buildMark();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mark.width} ${mark.height}"><path d="${mark.path}" fill="#000"/></svg>`;
};
const raster = rasterize(svgOfMark(), 480 * scale);
const filled = (x: number, y: number) => alphaAt(raster, x * scale, y * scale) > 127;

describe("the mark", () => {
  it("is 3 cells wide and 5 cells high, with cells 1.6 times as wide as they are high", () => {
    const { width, height } = buildMark();

    expect(width / height).toBeCloseTo(480 / 500, 5);
  });

  it("fills the seven cells of the checkerboard", () => {
    const cellCenters = [
      [240, 50],
      [80, 150],
      [400, 150],
      [240, 250],
      [80, 350],
      [400, 350],
      [240, 450],
    ] as const;

    for (const [x, y] of cellCenters) {
      expect(filled(x, y), `cell at ${x},${y}`).toBe(true);
    }
  });

  it("leaves the gaps between cells empty, including the closed hole in row 3", () => {
    expect(filled(240, 350), "hole between rows 2 and 4").toBe(false);
    expect(filled(240, 150), "hole under the top cell").toBe(false);
    expect(filled(80, 50), "background beside the top cell").toBe(false);
    expect(filled(400, 250), "background beside the middle cell").toBe(false);
  });

  it("joins diagonal cells with a curved neck, except at the open join", () => {
    // Where cells touch at a corner, the neck between them is solid.
    expect(filled(160, 200), "join between row 1 left and the middle cell").toBe(true);
    expect(filled(320, 200), "join between row 1 right and the middle cell").toBe(true);
    expect(filled(160, 300), "join between the middle cell and row 3 left").toBe(true);
    expect(filled(320, 400), "join between row 3 right and the bottom cell").toBe(true);
    expect(filled(160, 100), "join between the top cell and row 1 left").toBe(true);
    // The top-right join stays open.
    expect(filled(320, 100), "the open join").toBe(false);
  });

  it("rounds the outer corners", () => {
    // Just inside the square corner of the top cell, which the rounding cuts away.
    expect(filled(164, 4), "top-left corner of the top cell").toBe(false);
    expect(filled(316, 4), "top-right corner of the top cell").toBe(false);
    expect(filled(4, 104), "top-left corner of the row 1 left cell").toBe(false);
  });

  it("is one merged shape: an outline plus the enclosed hole", () => {
    const subpaths = buildMark().path.match(/M/g) ?? [];

    expect(subpaths).toHaveLength(2);
  });
});
