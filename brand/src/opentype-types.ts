// The parts of opentype.js 2.0 that the brand pipeline uses. The package ships no types.
interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathCommand {
  type: "M" | "L" | "Q" | "C" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface Path {
  commands: PathCommand[];
  getBoundingBox(): BoundingBox;
}

interface Glyph {
  advanceWidth?: number;
  getPath(x: number, y: number, fontSize: number): Path;
}

interface Font {
  unitsPerEm: number;
  tables: { os2: { sCapHeight: number } };
  charToGlyph(character: string): Glyph;
  getKerningValue(left: Glyph, right: Glyph): number;
}

export interface OpenType {
  parse(buffer: ArrayBuffer | Uint8Array): Font;
}
