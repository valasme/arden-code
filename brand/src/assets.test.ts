import { PNG } from "pngjs";

import { buildRasterAssets } from "./assets.ts";

const assets = buildRasterAssets();

function png(path: string) {
  const bytes = assets[path];
  if (!bytes) throw new Error(`missing asset: ${path}`);
  return PNG.sync.read(Buffer.from(bytes));
}

function bmpSize(path: string) {
  const bytes = assets[path];
  if (!bytes) throw new Error(`missing asset: ${path}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getInt32(18, true), height: view.getInt32(22, true) };
}

/** Whether any solid pixel is close to the given color. */
function hasColor(image: PNG, [r, g, b]: [number, number, number], tolerance = 12) {
  for (let i = 0; i < image.data.length; i += 4) {
    if ((image.data[i + 3] ?? 0) < 250) continue;
    if (
      Math.abs((image.data[i] ?? 0) - r) <= tolerance &&
      Math.abs((image.data[i + 1] ?? 0) - g) <= tolerance &&
      Math.abs((image.data[i + 2] ?? 0) - b) <= tolerance
    ) {
      return true;
    }
  }
  return false;
}

describe("the raster assets", () => {
  it("has a 1024 px master of the mark for Tauri's icon generator", () => {
    const master = png("brand/assets/png/app-icon-1024.png");

    expect([master.width, master.height]).toEqual([1024, 1024]);
  });

  it("has a Windows icon with the eight sizes, from 16 to 256", () => {
    const ico = assets["apps/desktop/src-tauri/icons/icon.ico"];
    if (!ico) throw new Error("missing icon.ico");
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    const count = view.getUint16(4, true);
    const sizes = Array.from({ length: count }, (_, index) => view.getUint8(6 + index * 16) || 256);

    expect(sizes).toEqual([16, 20, 24, 32, 40, 48, 64, 256]);
  });

  it("has tray icons from 16 to 32 px", () => {
    for (const size of [16, 20, 24, 32]) {
      const tray = png(`apps/desktop/src-tauri/icons/tray/tray-${size}.png`);
      expect([tray.width, tray.height]).toEqual([size, size]);
    }
  });

  it("has the installer header and sidebar images at the sizes NSIS expects", () => {
    expect(bmpSize("apps/desktop/src-tauri/installer/header.bmp")).toEqual({
      width: 150,
      height: 57,
    });
    expect(bmpSize("apps/desktop/src-tauri/installer/sidebar.bmp")).toEqual({
      width: 164,
      height: 314,
    });
  });

  it("has a favicon, which is the mark on its own", () => {
    const favicon = new TextDecoder().decode(assets["apps/desktop/public/brand/favicon.svg"]);

    expect(favicon).toContain("<svg");
    expect(favicon).toContain('fill="#EA9061"');
    expect(favicon).not.toContain("#58382B");
  });

  it("has a README header for the light and the dark theme", () => {
    const light = png("brand/assets/github/readme-header-light.png");
    const dark = png("brand/assets/github/readme-header-dark.png");

    expect([light.width, light.height]).toEqual([dark.width, dark.height]);
    expect(hasColor(light, [0x58, 0x38, 0x2b])).toBe(true);
    expect(hasColor(light, [0xf2, 0xe8, 0xe1])).toBe(false);
    expect(hasColor(dark, [0xf2, 0xe8, 0xe1])).toBe(true);
    expect(hasColor(dark, [0x58, 0x38, 0x2b])).toBe(false);
  });

  it("has a 1280 x 640 social preview showing the logo and the tagline", () => {
    const preview = png("brand/assets/github/social-preview.png");

    expect([preview.width, preview.height]).toEqual([1280, 640]);
    expect(hasColor(preview, [0xea, 0x90, 0x61])).toBe(true);
    expect(hasColor(preview, [0x58, 0x38, 0x2b])).toBe(true);
    // The image is opaque: GitHub shows it on both light and dark pages.
    expect(preview.data[3]).toBe(255);
  });

  it("is identical every time it is built", () => {
    const again = buildRasterAssets();

    for (const [path, bytes] of Object.entries(assets)) {
      expect(Buffer.from(again[path] ?? []).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });
});
