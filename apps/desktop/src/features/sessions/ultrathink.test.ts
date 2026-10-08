import { withUltrathink } from "./ultrathink";

describe("withUltrathink", () => {
  it("adds the word at the end of a message", () => {
    expect(withUltrathink("Why does the build fail?")).toBe("Why does the build fail? ultrathink");
  });

  it("keeps a message that already holds the word, in any case", () => {
    expect(withUltrathink("ultrathink about this")).toBe("ultrathink about this");
    expect(withUltrathink("Please UltraThink.")).toBe("Please UltraThink.");
  });

  it("adds the word to a word that only contains it", () => {
    expect(withUltrathink("ultrathinking is a word")).toBe("ultrathinking is a word ultrathink");
  });

  it("leaves a slash command as it is", () => {
    expect(withUltrathink("/compact")).toBe("/compact");
  });
});
