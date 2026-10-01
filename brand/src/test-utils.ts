import { Resvg } from "@resvg/resvg-js";

export interface Raster {
  width: number;
  height: number;
  /** RGBA, row by row. */
  pixels: Uint8Array;
}

/** Renders SVG markup to pixels, `width` pixels wide, on a transparent background. */
export function rasterize(svg: string, width: number): Raster {
  const image = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render();
  return { width: image.width, height: image.height, pixels: new Uint8Array(image.pixels) };
}

/** Alpha (0 to 255) at a pixel. */
export function alphaAt(raster: Raster, x: number, y: number): number {
  return raster.pixels[(Math.floor(y) * raster.width + Math.floor(x)) * 4 + 3] ?? 0;
}
