import { buildIco } from "./ico.ts";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A stand-in for a PNG file: it only needs the PNG signature, for the container test. */
const fakePng = (marker: number) => Uint8Array.from([...pngSignature, marker, marker, marker]);

describe("buildIco", () => {
  const ico = buildIco([
    { size: 16, png: fakePng(1) },
    { size: 32, png: fakePng(2) },
    { size: 256, png: fakePng(3) },
  ]);
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  it("starts with the icon directory header", () => {
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type: icon
    expect(view.getUint16(4, true)).toBe(3); // image count
  });

  it("lists each image's size, where 256 is written as 0", () => {
    const sizes = [0, 1, 2].map((index) => view.getUint8(6 + index * 16));

    expect(sizes).toEqual([16, 32, 0]);
    expect([0, 1, 2].map((index) => view.getUint8(7 + index * 16))).toEqual([16, 32, 0]);
  });

  it("points each entry at the PNG data it describes", () => {
    for (const [index, marker] of [1, 2, 3].entries()) {
      const length = view.getUint32(6 + index * 16 + 8, true);
      const offset = view.getUint32(6 + index * 16 + 12, true);

      expect(length).toBe(pngSignature.length + 3);
      expect(Array.from(ico.slice(offset, offset + 8))).toEqual(pngSignature);
      expect(ico[offset + 8]).toBe(marker);
    }
  });
});
