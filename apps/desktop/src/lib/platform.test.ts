import { afterEach, describe, expect, it } from "vitest";

import { currentPlatform, PLATFORM_GLOBAL } from "./platform";

afterEach(() => {
  Reflect.deleteProperty(globalThis, PLATFORM_GLOBAL);
});

describe("currentPlatform", () => {
  it("is the platform Rust named", () => {
    Reflect.set(globalThis, PLATFORM_GLOBAL, "linux");
    expect(currentPlatform()).toBe("linux");

    Reflect.set(globalThis, PLATFORM_GLOBAL, "windows");
    expect(currentPlatform()).toBe("windows");
  });

  it("is Windows when Rust named none, or one the page does not know", () => {
    expect(currentPlatform()).toBe("windows");

    Reflect.set(globalThis, PLATFORM_GLOBAL, "macos");
    expect(currentPlatform()).toBe("windows");
  });
});
