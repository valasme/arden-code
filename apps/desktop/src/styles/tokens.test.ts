import { readFileSync } from "node:fs";

import { compositeOver, contrastRatio, oklchToSrgb, parseColor, type Rgb } from "@/lib/contrast";

/** Custom properties declared in the first rule that starts with `selector`. */
function readTokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css has no ${selector} rule`);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[match[1] ?? ""] = (match[2] ?? "").trim();
  }
  return tokens;
}

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const themes = { light: readTokens(css, ":root"), dark: readTokens(css, ".dark") } as const;

/** A token as an opaque color: translucent tokens are drawn over `background`. */
function color(theme: keyof typeof themes, token: string, background: Rgb): Rgb {
  const value = themes[theme][`--${token}`];
  if (!value) throw new Error(`${theme} theme has no --${token}`);
  return compositeOver(parseColor(value), background);
}

const opaque = (theme: keyof typeof themes, token: string): Rgb => color(theme, token, [0, 0, 0]);

/** Text and its background. WCAG AA asks for 4.5:1. */
const textPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["accent-foreground", "accent"],
  ["destructive", "background"],
  // The destructive button fills with --destructive on hover and switches its text to --background.
  ["background", "destructive"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
] as const;

/** Control borders and focus outlines against the surface they sit on. WCAG AA asks for 3:1. */
const controlPairs = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["ring", "popover"],
  ["sidebar-ring", "sidebar"],
] as const;

describe.each(["light", "dark"] as const)("the %s theme", (theme) => {
  it.each(textPairs)("keeps %s readable on %s (4.5:1)", (foreground, background) => {
    const surface = opaque(theme, background);
    const ratio = contrastRatio(color(theme, foreground, surface), surface);

    expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(controlPairs)("keeps %s visible on %s (3:1)", (control, surface) => {
    const background = opaque(theme, surface);
    const ratio = contrastRatio(color(theme, control, background), background);

    expect(ratio, `${control} on ${surface}`).toBeGreaterThanOrEqual(3);
  });
});

/** The contrast of two written-out colors on a white page. */
const ratio = (foreground: string, background: string, over: Rgb = [1, 1, 1]) =>
  contrastRatio(
    compositeOver(parseColor(foreground), over),
    compositeOver(parseColor(background), over),
  );

describe("the audit that led to the corrected tokens (ADR 0010)", () => {
  it("reproduces the failures of the original shadcn values", () => {
    expect(ratio("oklch(0.556 0 0)", "oklch(0.97 0 0)")).toBeCloseTo(4.34, 1); // muted text
    expect(ratio("oklch(0.708 0 0)", "oklch(1 0 0)")).toBeCloseTo(2.6, 1); // focus ring
    expect(ratio("oklch(0.922 0 0)", "oklch(1 0 0)")).toBeCloseTo(1.3, 1); // control border
    const dark = oklchToSrgb(parseColor("oklch(0.145 0 0)"));
    expect(contrastRatio(compositeOver(parseColor("oklch(1 0 0 / 15%)"), dark), dark)).toBeCloseTo(
      1.5,
      1,
    ); // dark control border
  });

  it("reproduces the contrast of the sidebar's active item before and after the fix", () => {
    expect(ratio("oklch(0.985 0 0)", "oklch(0.922 0 0)")).toBeCloseTo(1.2, 1);
    expect(ratio("oklch(0.205 0 0)", "oklch(0.922 0 0)")).toBeCloseTo(14.2, 1);
  });
});

describe("the brand tokens", () => {
  it("has the logo colors from the plan", () => {
    expect(themes.light["--brand"]).toBe("oklch(0.737 0.126 47.7)");
    expect(themes.light["--brand-wordmark"]).toBe("oklch(0.375 0.051 42.9)");
    expect(themes.dark["--brand-wordmark"]).toBe("oklch(0.937 0.014 57.6)");
  });

  it("keeps the corner radius at zero", () => {
    expect(themes.light["--radius"]).toBe("0");
  });
});
