import { nextZoom, zoomRange } from "./zoom";

describe("nextZoom", () => {
  it("steps up and down through the usual browser zoom levels", () => {
    expect(nextZoom(100, "in")).toBe(110);
    expect(nextZoom(110, "in")).toBe(125);
    expect(nextZoom(125, "out")).toBe(110);
    expect(nextZoom(110, "out")).toBe(100);
    expect(nextZoom(100, "out")).toBe(90);
  });

  it("goes to the next level from a value between two levels", () => {
    expect(nextZoom(105, "in")).toBe(110);
    expect(nextZoom(105, "out")).toBe(100);
    expect(nextZoom(101, "out")).toBe(100);
  });

  it("stops at the ends of the range", () => {
    expect(nextZoom(zoomRange.max, "in")).toBe(200);
    expect(nextZoom(zoomRange.min, "out")).toBe(80);
    expect(nextZoom(195, "in")).toBe(200);
    expect(nextZoom(85, "out")).toBe(80);
  });

  it("has the same range as Rust: 80 to 200 percent", () => {
    expect(zoomRange).toEqual({ min: 80, max: 200 });
  });
});
