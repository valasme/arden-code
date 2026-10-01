import { encodeBmp } from "./bmp.ts";

describe("encodeBmp", () => {
  // A 3 x 2 image: top row red, green, blue; bottom row white, black, gray. 3 pixels of 3 bytes
  // make 9 bytes per row, which BMP pads to 12.
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128,
    255,
  ]);
  const bmp = encodeBmp({ width: 3, height: 2, pixels: rgba });
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  it("has the BMP signature and the right sizes", () => {
    expect(String.fromCharCode(bmp[0] ?? 0, bmp[1] ?? 0)).toBe("BM");
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(bmp.length).toBe(54 + 12 * 2);
    expect(view.getInt32(18, true)).toBe(3);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
  });

  it("stores rows bottom-up with pixels in blue, green, red order", () => {
    const pixelData = view.getUint32(10, true);

    // First stored row is the bottom row: white, black, gray.
    expect(Array.from(bmp.slice(pixelData, pixelData + 9))).toEqual([
      255, 255, 255, 0, 0, 0, 128, 128, 128,
    ]);
    // Second stored row is the top row: red, green, blue.
    const top = pixelData + 12;
    expect(Array.from(bmp.slice(top, top + 9))).toEqual([0, 0, 255, 0, 255, 0, 255, 0, 0]);
  });
});
