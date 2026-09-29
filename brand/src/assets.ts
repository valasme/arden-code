/** Every raster and packaged asset made from the logo (plan section 8.4). */

import { encodeBmp } from "./bmp.ts";
import { variants } from "./colors.ts";
import { buildIco } from "./ico.ts";
import { markIconSvg } from "./icons.ts";
import { buildLogoFiles } from "./logo-files.ts";
import { buildShapes, type ShapeName } from "./lockups.ts";
import { renderImage, renderPng } from "./render.ts";
import { buildWordmark } from "./wordmark.ts";

const tagline = "A Windows cockpit for Claude Code and Codex";
const shapes = buildShapes();

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A logo scaled to fit inside `box` and centered in it, as an SVG group. */
function placeLogo(name: ShapeName, variant: keyof typeof variants, box: Box): string {
  const shape = shapes[name];
  const scale = Math.min(box.width / shape.width, box.height / shape.height);
  const x = box.x + (box.width - shape.width * scale) / 2;
  const y = box.y + (box.height - shape.height * scale) / 2;
  const paths = shape.parts
    .map((part) => `<path fill="${variants[variant][part.role]}" d="${part.path}"/>`)
    .join("");
  return `<g transform="translate(${x} ${y}) scale(${scale})">${paths}</g>`;
}

function canvas(width: number, height: number, background: string | undefined, content: string) {
  const fill = background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${fill}${content}</svg>`
  );
}

function socialPreviewSvg(): string {
  const width = 1280;
  const height = 640;
  const logo = { width: 820, height: 200 };
  const words = buildWordmark({ text: tagline, fontSize: 38, letterSpacing: 0 });
  const wordsWidth = words.bounds.right - words.bounds.left;
  const gap = 60;
  const blockHeight = logo.height + gap + (words.bounds.bottom - words.bounds.top);
  const top = (height - blockHeight) / 2;
  const placed = buildWordmark({
    text: tagline,
    fontSize: 38,
    letterSpacing: 0,
    x: (width - wordsWidth) / 2 - words.bounds.left,
    y: top + logo.height + gap - words.bounds.top,
  });
  return canvas(
    width,
    height,
    "#FFFFFF",
    placeLogo("logo-horizontal", "color-on-light", {
      x: (width - logo.width) / 2,
      y: top,
      width: logo.width,
      height: logo.height,
    }) + `<path fill="${variants["color-on-light"].wordmark}" d="${placed.path}"/>`,
  );
}

const iconSizes = [16, 20, 24, 32, 40, 48, 64, 256] as const;
const traySizes = [16, 20, 24, 32] as const;

/** Repository-relative path to file contents. */
export function buildRasterAssets(): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {};
  const text = new TextEncoder();

  assets["brand/assets/png/app-icon-1024.png"] = renderPng(markIconSvg(1024));

  assets["apps/desktop/src-tauri/icons/icon.ico"] = buildIco(
    iconSizes.map((size) => ({ size, png: renderPng(markIconSvg(size)) })),
  );

  for (const size of traySizes) {
    assets[`apps/desktop/src-tauri/icons/tray/tray-${size}.png`] = renderPng(markIconSvg(size));
  }

  assets["apps/desktop/src-tauri/installer/header.bmp"] = encodeBmp(
    renderImage(
      canvas(
        150,
        57,
        "#FFFFFF",
        placeLogo("logo-horizontal", "color-on-light", { x: 8, y: 8, width: 134, height: 41 }),
      ),
    ),
  );
  assets["apps/desktop/src-tauri/installer/sidebar.bmp"] = encodeBmp(
    renderImage(
      canvas(
        164,
        314,
        "#FFFFFF",
        placeLogo("logo-stacked", "color-on-light", { x: 16, y: 96, width: 132, height: 122 }),
      ),
    ),
  );

  assets["apps/desktop/public/brand/favicon.svg"] = text.encode(
    buildLogoFiles()["mark-color-on-light.svg"] ?? "",
  );

  for (const [theme, variant] of [
    ["light", "color-on-light"],
    ["dark", "color-on-dark"],
  ] as const) {
    assets[`brand/assets/github/readme-header-${theme}.png`] = renderPng(
      canvas(
        1280,
        320,
        undefined,
        placeLogo("logo-horizontal", variant, { x: 40, y: 40, width: 1200, height: 240 }),
      ),
    );
  }
  assets["brand/assets/github/social-preview.png"] = renderPng(socialPreviewSvg());

  return assets;
}
