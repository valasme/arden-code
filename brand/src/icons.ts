/** App icons: the mark alone, drawn to stay sharp at every size (plan section 8.3). */

import { variants } from "./colors.ts";
import { buildMark, defaultMarkParams } from "./mark.ts";

/** Icons at or below this size get a grid that is snapped to whole pixels. */
const snapLimit = 32;

/** How much of the icon's height a smoothly drawn mark fills. */
const fill = 0.86;

export interface IconOptions {
  /** Snap the grid to whole pixels. On by default for sizes up to 32 px. */
  snap?: boolean;
  color?: string;
}

/**
 * SVG of the mark centered in a square icon of `size` pixels.
 *
 * At small sizes the cell height and width are whole numbers of pixels and the mark sits on the
 * pixel grid, so straight edges are crisp instead of blurred across two rows of pixels.
 */
export function markIconSvg(size: number, options: IconOptions = {}): string {
  const snap = options.snap ?? size <= snapLimit;
  const color = options.color ?? variants["color-on-light"].mark;

  let cellHeight: number;
  let cellRatio = defaultMarkParams.cellRatio;
  let cornerRadius = defaultMarkParams.cornerRadius;
  let joinRadius = defaultMarkParams.joinRadius;
  let origin: { x: number; y: number };

  if (snap) {
    cellHeight = Math.floor(size / 5);
    const cellWidth = Math.round(defaultMarkParams.cellRatio * cellHeight);
    cellRatio = cellWidth / cellHeight;
    // Radii are whole pixels too, and at least one so the corners are still round.
    cornerRadius =
      Math.max(1, Math.round(defaultMarkParams.cornerRadius * cellHeight)) / cellHeight;
    joinRadius = Math.max(1, Math.round(defaultMarkParams.joinRadius * cellHeight)) / cellHeight;
    origin = {
      x: Math.floor((size - 3 * cellWidth) / 2),
      y: Math.floor((size - 5 * cellHeight) / 2),
    };
  } else {
    cellHeight = (size * fill) / 5;
    const markWidth = 3 * cellHeight * cellRatio;
    origin = { x: (size - markWidth) / 2, y: (size - 5 * cellHeight) / 2 };
  }

  const mark = buildMark(
    { ...defaultMarkParams, cellHeight, cellRatio, cornerRadius, joinRadius },
    origin,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<path fill="${color}" d="${mark.path}"/></svg>`
  );
}
