/** Windows icon files (.ico) holding PNG images, one per size. */

export interface IconImage {
  /** Width and height in pixels, at most 256. */
  size: number;
  /** A PNG file. */
  png: Uint8Array;
}

const headerLength = 6;
const entryLength = 16;

export function buildIco(images: readonly IconImage[]): Uint8Array {
  const dataStart = headerLength + entryLength * images.length;
  const total = images.reduce((sum, image) => sum + image.png.length, dataStart);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = dataStart;
  for (const [index, image] of images.entries()) {
    const entry = headerLength + index * entryLength;
    // A size of 256 is stored as 0.
    view.setUint8(entry, image.size >= 256 ? 0 : image.size);
    view.setUint8(entry + 1, image.size >= 256 ? 0 : image.size);
    view.setUint8(entry + 2, 0); // no color palette
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(image.png, offset);
    offset += image.png.length;
  }
  return bytes;
}
