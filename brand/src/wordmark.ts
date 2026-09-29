/** The wordmark: "Arden Code" in Lora Regular, converted to outlines (plan section 8.1). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { OpenType, PathCommand } from "./opentype-types.ts";

// opentype.js is loaded with require so that Node and Vitest both get the same build.
const loaded: unknown = createRequire(import.meta.url)("opentype.js");

function isOpenType(value: unknown): value is OpenType {
  return typeof value === "object" && value !== null && "parse" in value;
}

if (!isOpenType(loaded)) {
  throw new Error("opentype.js did not load as expected");
}
const opentype = loaded;

const file = readFileSync(new URL("../fonts/Lora-Regular-latin.woff", import.meta.url));
const font = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

function format(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error("a glyph outline has a coordinate that is not a number");
  }
  return String(Math.round(value * 100) / 100);
}

/** Writes outline commands as SVG path data. opentype.js has its own writer, but it can print NaN. */
function toPathData(commands: readonly PathCommand[]): string {
  return commands
    .map((command) => {
      switch (command.type) {
        case "M":
        case "L":
          return `${command.type}${format(command.x)} ${format(command.y)}`;
        case "Q":
          return `Q${format(command.x1)} ${format(command.y1)} ${format(command.x)} ${format(command.y)}`;
        case "C":
          return `C${format(command.x1)} ${format(command.y1)} ${format(command.x2)} ${format(command.y2)} ${format(command.x)} ${format(command.y)}`;
        case "Z":
          return "Z";
        default:
          throw new Error(`unknown outline command: ${String(command.type)}`);
      }
    })
    .join("");
}

export interface WordmarkOptions {
  text?: string;
  fontSize: number;
  /** Extra space after each letter, as a fraction of the font size. */
  letterSpacing?: number;
  /** Left edge of the text origin. */
  x?: number;
  /** Baseline. */
  y?: number;
}

export interface Wordmark {
  /** SVG path data of the letters. */
  path: string;
  /** The box around the ink, in the same coordinates as the path. */
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Height of a capital letter, from the baseline. */
  capHeight: number;
}

/**
 * Lays the letters out one by one, using each glyph's advance width and the font's kerning pairs.
 * The logo is plain Latin text, so it needs none of the font's contextual substitutions.
 */
export function buildWordmark({
  text = "Arden Code",
  fontSize,
  letterSpacing = -0.01,
  x = 0,
  y = 0,
}: WordmarkOptions): Wordmark {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = Array.from(text).map((character) => font.charToGlyph(character));
  const outlines: string[] = [];
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

  let pen = x;
  glyphs.forEach((glyph, index) => {
    const outline = glyph.getPath(pen, y, fontSize);
    const data = toPathData(outline.commands);
    if (data) {
      const box = outline.getBoundingBox();
      outlines.push(data);
      bounds.left = Math.min(bounds.left, box.x1);
      bounds.top = Math.min(bounds.top, box.y1);
      bounds.right = Math.max(bounds.right, box.x2);
      bounds.bottom = Math.max(bounds.bottom, box.y2);
    }
    pen += (glyph.advanceWidth ?? 0) * scale + letterSpacing * fontSize;
    const next = glyphs[index + 1];
    if (next) pen += font.getKerningValue(glyph, next) * scale;
  });

  return {
    path: outlines.join(""),
    bounds,
    capHeight: font.tables.os2.sCapHeight * scale,
  };
}
