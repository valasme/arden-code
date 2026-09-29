import { Resvg } from "@resvg/resvg-js";

import type { Image } from "./bmp.ts";

/** Renders SVG at its own width and height and returns a PNG file. */
export function renderPng(svg: string): Uint8Array {
  return new Uint8Array(new Resvg(svg).render().asPng());
}

/** Renders SVG at its own width and height and returns its pixels. */
export function renderImage(svg: string): Image {
  const image = new Resvg(svg).render();
  return { width: image.width, height: image.height, pixels: new Uint8Array(image.pixels) };
}
