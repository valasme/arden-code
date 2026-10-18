import { readFileSync } from "node:fs";

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

describe("the maintainer's theme, as supplied (ADR 0056)", () => {
  it("takes the supplied values that the old accessibility bar had changed", () => {
    expect(themes.light).toMatchObject({
      "--muted-foreground": "oklch(0.556 0 0)",
      "--input": "oklch(0.922 0 0)",
      "--ring": "oklch(0.708 0 0)",
      "--sidebar-ring": "oklch(0.708 0 0)",
    });
    expect(themes.dark).toMatchObject({
      "--input": "oklch(1 0 0 / 15%)",
    });
  });

  it("keeps the dark sidebar neutral instead of the supplied blue (the councils, Q2)", () => {
    expect(themes.dark).toMatchObject({
      "--sidebar-primary": "oklch(0.922 0 0)",
      "--sidebar-primary-foreground": "oklch(0.205 0 0)",
    });
  });

  it("rounds corners from a radius of 0.45rem", () => {
    expect(themes.light["--radius"]).toBe("0.45rem");
  });

  it("has no rules for Windows contrast themes", () => {
    expect(css).not.toContain("forced-colors");
  });
});

describe("the brand tokens", () => {
  it("has the logo colors from the plan", () => {
    expect(themes.light["--brand"]).toBe("oklch(0.737 0.126 47.7)");
    expect(themes.light["--brand-wordmark"]).toBe("oklch(0.375 0.051 42.9)");
    expect(themes.dark["--brand-wordmark"]).toBe("oklch(0.937 0.014 57.6)");
  });
});
