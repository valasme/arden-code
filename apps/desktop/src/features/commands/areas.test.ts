import { nextArea, type Area } from "./areas";

const all: readonly Area[] = [
  "titlebar",
  "sidebar",
  "session",
  "messagebox",
  "inspector",
  "statusbar",
];

describe("nextArea", () => {
  it("moves forward through the areas, and wraps around", () => {
    expect(nextArea(all, "titlebar", 1)).toBe("sidebar");
    expect(nextArea(all, "sidebar", 1)).toBe("session");
    expect(nextArea(all, "statusbar", 1)).toBe("titlebar");
  });

  it("moves backward, and wraps around", () => {
    expect(nextArea(all, "sidebar", -1)).toBe("titlebar");
    expect(nextArea(all, "titlebar", -1)).toBe("statusbar");
  });

  it("skips an area that is not there, such as a closed inspector or a session without a message box", () => {
    const present: readonly Area[] = ["titlebar", "sidebar", "session", "statusbar"];

    expect(nextArea(present, "session", 1)).toBe("statusbar");
    expect(nextArea(present, "statusbar", -1)).toBe("session");
  });

  it("starts at the first area going forward and the last going back when focus is in none", () => {
    expect(nextArea(all, undefined, 1)).toBe("titlebar");
    expect(nextArea(all, undefined, -1)).toBe("statusbar");
  });

  it("goes to the next present area when the current one has just gone away", () => {
    // The inspector was focused and got closed: the areas around it are what is left.
    const present: readonly Area[] = ["titlebar", "sidebar", "session", "statusbar"];

    expect(nextArea(present, "inspector", 1)).toBe("statusbar");
    expect(nextArea(present, "inspector", -1)).toBe("session");
  });

  it("stays in the only area there is, and has nowhere to go when there is none", () => {
    expect(nextArea(["session"], "session", 1)).toBe("session");
    expect(nextArea([], undefined, 1)).toBeUndefined();
  });
});
