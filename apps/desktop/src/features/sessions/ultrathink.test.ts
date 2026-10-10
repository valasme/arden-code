import { holdsUltrathink, withUltrathink } from "./ultrathink";

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

describe("holdsUltrathink", () => {
  it("finds the word on its own, in any case", () => {
    expect(holdsUltrathink("please ultrathink this")).toBe(true);
    expect(holdsUltrathink("UltraThink.")).toBe(true);
  });

  it("does not find it inside another word, in a slash command, or in nothing", () => {
    expect(holdsUltrathink("ultrathinking is a word")).toBe(false);
    expect(holdsUltrathink("/compact ultrathink")).toBe(false);
    expect(holdsUltrathink("")).toBe(false);
  });
});
