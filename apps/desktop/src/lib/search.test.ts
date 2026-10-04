import { matchesSearch } from "./search";

const zoom = {
  label: "Zoom",
  description: "Makes everything larger or smaller, from 80 to 200 percent.",
};
const theme = { label: "Theme", description: "Light or dark, or the same as Windows." };

describe("matchesSearch", () => {
  it("finds a setting by a part of its name, in any case", () => {
    expect(matchesSearch(zoom, "zo")).toBe(true);
    expect(matchesSearch(zoom, "ZOOM")).toBe(true);
    expect(matchesSearch(theme, "zoom")).toBe(false);
  });

  it("finds a setting by a word in its description", () => {
    expect(matchesSearch(theme, "windows")).toBe(true);
    expect(matchesSearch(zoom, "larger")).toBe(true);
  });

  it("needs every word, wherever each one is", () => {
    expect(matchesSearch(theme, "dark windows")).toBe(true);
    expect(matchesSearch(theme, "dark zoom")).toBe(false);
    expect(matchesSearch(theme, "  theme   light ")).toBe(true);
  });

  it("ignores accents, so a word is found however it is typed", () => {
    expect(matchesSearch({ label: "Café", description: "" }, "cafe")).toBe(true);
    expect(matchesSearch({ label: "Cafe", description: "" }, "café")).toBe(true);
  });

  it("matches everything when nothing has been typed", () => {
    expect(matchesSearch(theme, "")).toBe(true);
    expect(matchesSearch(theme, "   ")).toBe(true);
  });
});
