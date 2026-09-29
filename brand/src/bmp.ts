/** 24-bit BMP files, which the NSIS installer needs for its header and sidebar images. */

export interface Image {
  width: number;
  height: number;
  /** RGBA, row by row from the top. Transparency is ignored: draw on a background first. */
  pixels: Uint8Array;
}

const headerLength = 54;

export function encodeBmp({ width, height, pixels }: Image): Uint8Array {
  // Each row is padded to a multiple of 4 bytes.
  const rowLength = Math.ceil((width * 3) / 4) * 4;
  const bytes = new Uint8Array(headerLength + rowLength * height);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42; // "B"
  bytes[1] = 0x4d; // "M"
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, headerLength, true);
  view.setUint32(14, 40, true); // size of the info header
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(34, rowLength * height, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y++) {
    // Rows are stored bottom-up, with pixels in blue, green, red order.
    const row = headerLength + (height - 1 - y) * rowLength;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      bytes[row + x * 3] = pixels[source + 2] ?? 0;
      bytes[row + x * 3 + 1] = pixels[source + 1] ?? 0;
      bytes[row + x * 3 + 2] = pixels[source] ?? 0;
    }
  }
  return bytes;
}
