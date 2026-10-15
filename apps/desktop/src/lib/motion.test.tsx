import { closing, opening } from "./motion";

import "@/styles/global.css";

/** A token as the page reads it. */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

describe("What Motion moves", () => {
  it("moves at the same pace and on the same curves as the overlays", () => {
    expect(`${opening.duration * 1000}ms`).toBe(token("--motion-open-duration"));
    expect(`${closing.duration * 1000}ms`).toBe(token("--motion-close-duration"));
    expect(`cubic-bezier(${opening.ease.join(", ")})`).toBe(token("--motion-open-curve"));
    expect(`cubic-bezier(${closing.ease.join(", ")})`).toBe(token("--motion-close-curve"));
  });
});
