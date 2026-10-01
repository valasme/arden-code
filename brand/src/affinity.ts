/** The Affinity brand library (plan section 8.5): a sketchbook built from the generated files. */

import { rasterSources } from "./assets.ts";
import { variants } from "./colors.ts";
import { buildLogoFiles } from "./logo-files.ts";
import { buildWordmark } from "./wordmark.ts";

/** One step of an outline, in absolute coordinates: move, line, cubic curve or close. */
export type Segment =
  | ["M", number, number]
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

/** A filled outline. */
export interface Shape {
  fill: string;
  segments: Segment[];
}

/** One generated file, as an artboard draws it. */
export interface Artwork {
  width: number;
  height: number;
  /** The file's own background, when it has one (a raster image's). */
  background?: string;
  shapes: Shape[];
}

/** A line of live text on an artboard, such as a color's value. */
export interface Label {
  text: string;
  x: number;
  /** The baseline. */
  y: number;
  color: string;
}

export interface Artboard {
  name: string;
  /** A color behind the artwork so it can be seen, which is not part of the file it shows. */
  backdrop?: string;
  artwork: Artwork;
  labels: Label[];
}

export interface Library {
  artboards: Artboard[];
}

/** Whether a file is made for dark backgrounds, and so shown on one. */
const onDark = (name: string) => /-(color-on-dark|white)$|-dark$/.test(name);

/** The app theme's backgrounds (`--background` in `tokens.css`), which the logos are made for. */
const backgrounds = { light: "#FFFFFF", dark: "#0A0A0A" } as const;

const shapeNames = ["mark", "wordmark", "logo-horizontal", "logo-stacked"] as const;

/** A rectangle as an outline. */
function rectangle(x: number, y: number, width: number, height: number, fill: string): Shape {
  return {
    fill,
    segments: [
      ["M", x, y],
      ["L", x + width, y],
      ["L", x + width, y + height],
      ["L", x, y + height],
      ["Z"],
    ],
  };
}

/** The colors of plan section 8.2, each theme on its own background. */
function colorsArtboard(): Artboard {
  const shapes: Shape[] = [];
  const labels: Label[] = [];
  const themes = [
    { name: "Light", variant: variants["color-on-light"], background: backgrounds.light },
    { name: "Dark", variant: variants["color-on-dark"], background: backgrounds.dark },
  ];
  themes.forEach(({ name, variant, background }, column) => {
    const left = column * 360;
    const ink = variant.wordmark;
    shapes.push(rectangle(left, 0, 360, 420, background));
    labels.push({ text: name, x: left + 32, y: 48, color: ink });
    for (const [row, [role, color]] of [
      ["Mark", variant.mark],
      ["Wordmark", variant.wordmark],
    ].entries()) {
      const top = 80 + row * 128;
      shapes.push(rectangle(left + 32, top, 96, 96, color ?? ink));
      labels.push({ text: `${role} ${color}`, x: left + 152, y: top + 56, color: ink });
    }
    labels.push({ text: `Background ${background}`, x: left + 32, y: 380, color: ink });
  });
  return { name: "Colors", artwork: { width: 720, height: 420, shapes }, labels };
}

/** Lora, the wordmark's typeface, as outlines: the font need not be installed to see it. */
function typeArtboard(): Artboard {
  const ink = variants["color-on-light"].wordmark;
  const lines = [
    { text: "Arden Code", size: 96, baseline: 128 },
    { text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", size: 48, baseline: 224 },
    { text: "abcdefghijklmnopqrstuvwxyz", size: 48, baseline: 300 },
    { text: "0123456789 & ? ! . , : ; ( )", size: 48, baseline: 376 },
  ];
  const shapes = lines.map(({ text, size, baseline }) => ({
    fill: ink,
    segments: cubicSegments(
      buildWordmark({ text, fontSize: size, letterSpacing: 0, x: 48, y: baseline }).path,
    ),
  }));
  return {
    name: "Type",
    artwork: { width: 1000, height: 480, background: backgrounds.light, shapes },
    labels: [
      {
        text: "Lora Regular, the wordmark's typeface (SIL Open Font License 1.1), drawn as outlines",
        x: 48,
        y: 440,
        color: ink,
      },
    ],
  };
}

/** An artboard that shows one generated file, on a dark backdrop when it is made for one. */
function fileArtboard(name: string, svg: string): Artboard {
  return {
    name,
    ...(onDark(name) ? { backdrop: backgrounds.dark } : {}),
    artwork: readSvg(svg),
    labels: [],
  };
}

/**
 * Everything the Affinity document shows: an artboard for each generated logo file and each image
 * made from the logo, then the colors and the type. The files themselves stay the source of truth.
 */
export function brandLibrary(): Library {
  const logoFiles = buildLogoFiles();
  const logos = shapeNames.flatMap((shape) =>
    Object.keys(variants).map((variant) => `${shape}-${variant}`),
  );
  const images = rasterSources();
  return {
    artboards: [
      ...logos.map((name) => fileArtboard(name, logoFiles[`${name}.svg`] ?? "")),
      ...Object.entries(images).map(([name, svg]) => fileArtboard(name, svg)),
      colorsArtboard(),
      typeArtboard(),
    ],
  };
}

/** The code that runs in Affinity: it draws `library`, which comes before it in the script. */
const drawLibrary = String.raw`const { Document, NewDocumentOptions } = require('/document.js');
const { AddChildNodesCommandBuilder, DocumentCommand } = require('/commands.js');
const { ArtTextNodeDefinition, PolyCurveNodeDefinition, ShapeNodeDefinition } = require('/nodes.js');
const { CurveBuilder, Point, PolyCurve, Rectangle } = require('/geometry.js');
const { ShapeRectangle } = require('/shapes.js');
const { Colour } = require('/colours.js');
const { FillDescriptor, SolidFill } = require('/fills.js');
const { GlyphAtts } = require('/glyphatts.js');
const { StoryBuilder } = require('/storybuilder.js');
const { UnitType } = require('/units.js');

function fill(hex) {
    const value = parseInt(hex.slice(1), 16);
    const colour = Colour.createRGBA8({ r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, alpha: 255 });
    return FillDescriptor.createSolid(SolidFill.create(colour));
}

// Moves, lines, cubic curves and closes, moved by (dx, dy): one curve per move.
function outline(segments, dx, dy) {
    const curves = PolyCurve.create();
    let builder = null;
    const finish = () => {
        if (builder) curves.addCurve(builder.createCurve());
        builder = null;
    };
    for (const s of segments) {
        if (s[0] === 'M') {
            finish();
            builder = CurveBuilder.create();
            builder.beginXY(s[1] + dx, s[2] + dy);
        } else if (s[0] === 'L') {
            builder.lineToXY(s[1] + dx, s[2] + dy);
        } else if (s[0] === 'C') {
            builder.addBezierXY(s[1] + dx, s[2] + dy, s[3] + dx, s[4] + dy, s[5] + dx, s[6] + dy);
        } else {
            builder.close();
            finish();
        }
    }
    finish();
    return curves;
}

function shapeNode(segments, colour, dx, dy) {
    const node = PolyCurveNodeDefinition.createDefault();
    node.curves = outline(segments, dx, dy);
    node.addBrushFillDescriptor(fill(colour));
    return node;
}

function box(x, y, width, height) {
    return [['M', x, y], ['L', x + width, y], ['L', x + width, y + height], ['L', x, y + height], ['Z']];
}

function textNode(doc, label, dx, dy) {
    const story = StoryBuilder.create();
    story.setToArtisticTextDefaultStyle(doc.dpi, doc.rasterFormat);
    const atts = GlyphAtts.create();
    atts.height = 20;
    atts.brushFill = fill(label.color);
    story.setGlyphAtts(atts);
    story.addText(label.text);
    return ArtTextNodeDefinition.createFromStoryBuilder(new Point(label.x + dx, label.y + dy), story);
}

// Adds nodes inside an artboard, and names them when a name is given.
function addInside(doc, artboard, nodes, name) {
    const add = AddChildNodesCommandBuilder.create();
    add.setInsertionTarget(artboard);
    for (const node of nodes) add.addNode(node);
    doc.executeCommand(add.createCommand(true));
    if (name) doc.executeCommand(DocumentCommand.createSetDescription(doc.selection, name));
}

function drawArtboard(doc, board) {
    const { x, y, artwork } = board;
    const frame = ShapeNodeDefinition.createDefault();
    frame.shape = ShapeRectangle.create();
    frame.setBoundingRectangle(new Rectangle(x, y, artwork.width, artwork.height));
    doc.executeCommand(DocumentCommand.createAddArtboard(frame));
    const artboards = doc.artboards;
    const artboard = artboards[artboards.length - 1].node;
    doc.executeCommand(DocumentCommand.createSetDescription(doc.selection, board.name));

    const area = box(0, 0, artwork.width, artwork.height);
    if (board.backdrop)
        addInside(doc, artboard, [shapeNode(area, board.backdrop, x, y)], 'Backdrop (not part of the file)');
    if (artwork.background)
        addInside(doc, artboard, [shapeNode(area, artwork.background, x, y)], 'Background');
    const nodes = artwork.shapes.map((shape) => shapeNode(shape.segments, shape.fill, x, y));
    for (const label of board.labels) nodes.push(textNode(doc, label, x, y));
    if (nodes.length > 0) addInside(doc, artboard, nodes, null);
    return artboard;
}

const options = NewDocumentOptions.createDefault();
options.units = UnitType.Pixel;
options.dpi = 72;
options.width = 1000;
options.height = 1000;
options.createArtboard = false;
const doc = Document.create(options);
for (const board of library.artboards) drawArtboard(doc, board);
console.log('Arden Code brand library: ' + library.artboards.length + ' artboards in document ' + doc.sessionUuid);
`;

/** Space between artboards. */
const gap = 120;

/**
 * The Affinity script that draws the library: the library itself as data, then the code that draws
 * it. Each logo shape has a row of its color variants, then come the images, then colors and type.
 */
export function affinityScript(): string {
  const { artboards } = brandLibrary();
  const rows = [
    ...shapeNames.map((shape) => (name: string) => name.startsWith(`${shape}-`)),
    (name: string) => name in rasterSources(),
    (name: string) => name === "Colors" || name === "Type",
  ];
  const placed: (Artboard & { x: number; y: number })[] = [];
  let top = 0;
  for (const inRow of rows) {
    const row = artboards.filter(
      (board) => inRow(board.name) && !placed.some((p) => p.name === board.name),
    );
    let left = 0;
    for (const board of row) {
      placed.push({ ...board, x: left, y: top });
      left += Math.ceil(board.artwork.width) + gap;
    }
    top += Math.max(0, ...row.map((board) => Math.ceil(board.artwork.height))) + gap;
  }
  return [
    "// Generated by `pnpm brand:build` from brand/src (affinity.ts). Do not edit: Affinity is a",
    "// sketchbook, and changes go back into the generator's parameters (brand/README.md).",
    "// Run it in Affinity (Window > Scripting): it makes a new document of the whole brand kit.",
    "'use strict';",
    `const library = ${JSON.stringify({ artboards: placed })};`,
    drawLibrary,
  ].join("\n");
}

/** Where a group puts its contents: scaled by `scale`, then moved by `x` and `y`. */
interface Placement {
  x: number;
  y: number;
  scale: number;
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function place(segment: Segment, { x, y, scale }: Placement): Segment {
  const atX = (value: number) => round(value * scale + x);
  const atY = (value: number) => round(value * scale + y);
  switch (segment[0]) {
    case "Z":
      return ["Z"];
    case "C": {
      const [, x1, y1, x2, y2, x3, y3] = segment;
      return ["C", atX(x1), atY(y1), atX(x2), atY(y2), atX(x3), atY(y3)];
    }
    default:
      return [segment[0], atX(segment[1]), atY(segment[2])];
  }
}

/** A generated SVG file: the generator writes only filled paths, a background and placed groups. */
export function readSvg(svg: string): Artwork {
  const placements: Placement[] = [{ x: 0, y: 0, scale: 1 }];
  const artwork: Artwork = { width: 0, height: 0, shapes: [] };

  for (const [tag = ""] of svg.matchAll(/<\/?[a-z]+[^>]*>/g)) {
    const current = placements.at(-1) ?? { x: 0, y: 0, scale: 1 };
    if (tag.startsWith("<svg")) {
      artwork.width = Number(attribute(tag, "width"));
      artwork.height = Number(attribute(tag, "height"));
    } else if (tag.startsWith("<rect")) {
      const fill = attribute(tag, "fill");
      if (fill) artwork.background = fill;
    } else if (tag.startsWith("<g")) {
      const [, x = "0", y = "0", scale = "1"] =
        /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
          attribute(tag, "transform") ?? "",
        ) ?? [];
      placements.push({
        x: current.x + Number(x) * current.scale,
        y: current.y + Number(y) * current.scale,
        scale: current.scale * Number(scale),
      });
    } else if (tag.startsWith("</g")) {
      placements.pop();
    } else if (tag.startsWith("<path")) {
      artwork.shapes.push({
        fill: attribute(tag, "fill") ?? "#000000",
        segments: cubicSegments(attribute(tag, "d") ?? "").map((segment) =>
          place(segment, current),
        ),
      });
    }
  }
  return artwork;
}

/** Thousandths of a pixel are plenty, and keep the script short. */
const round = (value: number) => Math.round(value * 1000) / 1000 + 0;

/** How many numbers each command takes. */
const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };

/**
 * A circular arc from (x0, y0) to (x, y) as cubic curves of at most a quarter turn each, following
 * the SVG specification's conversion from end points to a center (appendix F.6.5). The generator
 * only draws circles, so the radii are equal and the arc is not rotated.
 */
function arcToCubics(
  [x0, y0]: [number, number],
  [rx = 0, ry = 0, rotation = 0, largeArc = 0, sweep = 0, x = 0, y = 0]: number[],
): Segment[] {
  if (rx !== ry || rotation !== 0) {
    throw new Error(`only circular arcs are supported, not A${rx} ${ry} ${rotation}`);
  }
  const halfX = (x0 - x) / 2;
  const halfY = (y0 - y) / 2;
  // A radius too small to reach the end point grows until it does, as in a browser.
  const radius = Math.max(rx ?? 0, Math.hypot(halfX, halfY));
  const squared = halfX * halfX + halfY * halfY;
  const sign = largeArc === sweep ? -1 : 1;
  const coefficient = sign * Math.sqrt(Math.max(0, (radius * radius - squared) / squared));
  const centerX = coefficient * halfY + (x0 + x) / 2;
  const centerY = -coefficient * halfX + (y0 + y) / 2;

  const start = Math.atan2(y0 - centerY, x0 - centerX);
  let turn = Math.atan2(y - centerY, x - centerX) - start;
  if (sweep === 1 && turn < 0) turn += 2 * Math.PI;
  if (sweep === 0 && turn > 0) turn -= 2 * Math.PI;

  const parts = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 2) - 1e-9));
  const step = turn / parts;
  // The length of each handle, for a cubic curve that follows the circle as closely as possible.
  const handle = (4 / 3) * Math.tan(step / 4) * radius;
  const segments: Segment[] = [];
  for (let part = 0; part < parts; part++) {
    const from = start + part * step;
    const to = from + step;
    const endX = part === parts - 1 ? x : centerX + radius * Math.cos(to);
    const endY = part === parts - 1 ? y : centerY + radius * Math.sin(to);
    segments.push([
      "C",
      round(centerX + radius * Math.cos(from) - handle * Math.sin(from)),
      round(centerY + radius * Math.sin(from) + handle * Math.cos(from)),
      round(endX + handle * Math.sin(to)),
      round(endY - handle * Math.cos(to)),
      round(endX),
      round(endY),
    ]);
  }
  return segments;
}

/** SVG path data as moves, lines and cubic curves, the steps Affinity's scripts draw with. */
export function cubicSegments(d: string): Segment[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const segments: Segment[] = [];
  let point: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let index = 0;
  let command = "";

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (/^[A-Za-z]$/.test(token)) {
      if (!(token in arity)) {
        throw new Error(`the path has a command the generator never writes: ${token}`);
      }
      command = token;
      index += 1;
      if (command === "Z") {
        segments.push(["Z"]);
        point = start;
        continue;
      }
    }
    const values = tokens.slice(index, index + (arity[command] ?? 0)).map(Number);
    index += values.length;
    const [a = 0, b = 0, c = 0, e = 0, f = 0, g = 0] = values;
    switch (command) {
      case "M":
        segments.push(["M", round(a), round(b)]);
        point = [a, b];
        start = point;
        // More pairs after a move are lines.
        command = "L";
        break;
      case "L":
        segments.push(["L", round(a), round(b)]);
        point = [a, b];
        break;
      case "H":
        segments.push(["L", round(a), round(point[1])]);
        point = [a, point[1]];
        break;
      case "V":
        segments.push(["L", round(point[0]), round(a)]);
        point = [point[0], a];
        break;
      case "C":
        segments.push(["C", round(a), round(b), round(c), round(e), round(f), round(g)]);
        point = [f, g];
        break;
      case "Q":
        // The same curve as a cubic: each handle is two thirds of the way to the control point.
        segments.push([
          "C",
          round(point[0] + ((a - point[0]) * 2) / 3),
          round(point[1] + ((b - point[1]) * 2) / 3),
          round(c + ((a - c) * 2) / 3),
          round(e + ((b - e) * 2) / 3),
          round(c),
          round(e),
        ]);
        point = [c, e];
        break;
      case "A":
        segments.push(...arcToCubics(point, values));
        point = [f, g];
        break;
      default:
        throw new Error(`the path does not start with a command: ${d.slice(0, 20)}`);
    }
  }
  return segments;
}
