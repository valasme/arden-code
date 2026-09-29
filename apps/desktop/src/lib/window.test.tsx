import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import { showWindowWhenPainted } from "./window";

// `isTauri()` looks for this global, which the real Tauri runtime sets.
const runningInTauri = (value: boolean) => {
  Object.assign(globalThis, { isTauri: value });
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("showWindowWhenPainted", () => {
  it("shows the window only after the browser has painted a frame", async () => {
    runningInTauri(true);
    const calls: string[] = [];
    mockWindows("main");
    mockIPC((command) => {
      calls.push(command);
    });

    const shown = showWindowWhenPainted();
    // Nothing is shown synchronously: the first frame has not been drawn yet.
    expect(calls).not.toContain("plugin:window|show");

    await shown;
    expect(calls).toContain("plugin:window|show");
  });

  it("does nothing when the page runs outside Tauri, such as in a browser", async () => {
    await expect(showWindowWhenPainted()).resolves.toBeUndefined();
  });
});
