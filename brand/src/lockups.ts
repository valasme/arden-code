/** Arrangements of the mark and the wordmark (plan section 8.1). */

import { buildMark, defaultMarkParams } from "./mark.ts";
import { buildWordmark } from "./wordmark.ts";

export interface Shape {
  width: number;
  height: number;
  /** Outlines to fill, drawn in this order. Coordinates start at 0,0. */
  parts: { role: "mark" | "wordmark"; path: string }[];
}

export type ShapeName = "mark" | "wordmark" | "logo-horizontal" | "logo-stacked";

/** Mark height in drawing units. Everything else is sized from it. */
const markHeight = 500;
const markScale = markHeight / (5 * defaultMarkParams.cellHeight);
const markParams = { ...defaultMarkParams, cellHeight: defaultMarkParams.cellHeight * markScale };

/** In the original logo the mark is about as tall as the font size of the words beside it. */
const horizontalFontSize = markHeight / 1.02;
const horizontalGap = 0.22 * markHeight;
const stackedFontSize = 0.56 * markHeight;
const stackedGap = 0.3 * markHeight;

const round = (value: number) => Math.round(value * 100) / 100;

function markShape(): Shape {
  const mark = buildMark(markParams);
  return { width: mark.width, height: mark.height, parts: [{ role: "mark", path: mark.path }] };
}

function wordmarkShape(fontSize = horizontalFontSize): Shape {
  const probe = buildWordmark({ fontSize });
  const x = -probe.bounds.left;
  const y = -probe.bounds.top;
  const wordmark = buildWordmark({ fontSize, x, y });
  return {
    width: round(wordmark.bounds.right - wordmark.bounds.left),
    height: round(wordmark.bounds.bottom - wordmark.bounds.top),
    parts: [{ role: "wordmark", path: wordmark.path }],
  };
}

function horizontalShape(): Shape {
  const mark = markShape();
  const probe = buildWordmark({ fontSize: horizontalFontSize });
  const inkHeight = probe.bounds.bottom - probe.bounds.top;
  const left = mark.width + horizontalGap;
  // Center the words' ink on the mark's center line.
  const top = (mark.height - inkHeight) / 2;
  const wordmark = buildWordmark({
    fontSize: horizontalFontSize,
    x: left - probe.bounds.left,
    y: top - probe.bounds.top,
  });
  return {
    width: round(wordmark.bounds.right),
    height: mark.height,
    parts: [...mark.parts, { role: "wordmark", path: wordmark.path }],
  };
}

function stackedShape(): Shape {
  const probe = buildWordmark({ fontSize: stackedFontSize });
  const wordmarkWidth = probe.bounds.right - probe.bounds.left;
  const markWidth = markShape().width;
  const width = Math.max(wordmarkWidth, markWidth);
  const mark = buildMark(markParams, { x: (width - markWidth) / 2, y: 0 });
  const wordmarkTop = markHeight + stackedGap;
  const wordmark = buildWordmark({
    fontSize: stackedFontSize,
    x: (width - wordmarkWidth) / 2 - probe.bounds.left,
    y: wordmarkTop - probe.bounds.top,
  });
  return {
    width: round(width),
    height: round(wordmark.bounds.bottom),
    parts: [
      { role: "mark", path: mark.path },
      { role: "wordmark", path: wordmark.path },
    ],
  };
}

export function buildShapes(): Record<ShapeName, Shape> {
  return {
    mark: markShape(),
    wordmark: wordmarkShape(),
    "logo-horizontal": horizontalShape(),
    "logo-stacked": stackedShape(),
  };
}
