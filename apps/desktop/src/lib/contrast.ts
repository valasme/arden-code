/**
 * WCAG contrast maths for the theme's OKLCH colors. The theme test uses it to keep every token pair
 * above its target, independently of how a browser converts the colors.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** Red, green and blue from 0 to 1, in the sRGB color space. */
export type Rgb = readonly [number, number, number];

/** Parses `oklch(L C H)` and `oklch(L C H / A%)`. */
export function parseColor(text: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/.exec(
    text.trim(),
  );
  if (!match) throw new Error(`expected an oklch() color, got "${text}"`);
  const [, l, c, h, alpha, percent] = match;
  return {
    l: Number(l),
    c: Number(c),
    h: Number(h),
    alpha: alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1),
  };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const encode = (linear: number) =>
  linear <= 0.003_130_8 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
const decode = (channel: number) =>
  channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** Converts to sRGB, clipping colors outside its range. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const l_ = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m_ = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s_ = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  return [
    encode(clamp(4.076_741_662_1 * l_ - 3.307_711_591_3 * m_ + 0.230_969_929_2 * s_)),
    encode(clamp(-1.268_438_004_6 * l_ + 2.609_757_401_1 * m_ - 0.341_319_396_5 * s_)),
    encode(clamp(-0.004_196_086_3 * l_ - 0.703_418_614_7 * m_ + 1.707_614_701 * s_)),
  ];
}

/** Draws a color with transparency over an opaque background. */
export function compositeOver(color: Oklch, background: Rgb): Rgb {
  const [r, g, b] = oklchToSrgb(color);
  const blend = (top: number, bottom: number) => top * color.alpha + bottom * (1 - color.alpha);
  return [blend(r, background[0]), blend(g, background[1]), blend(b, background[2])];
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/** The WCAG contrast ratio of two opaque colors, from 1 to 21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [luminance(first), luminance(second)].toSorted((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
