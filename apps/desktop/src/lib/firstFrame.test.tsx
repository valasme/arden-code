import { mockIPC } from "@tauri-apps/api/mocks";

import { defaultSettings } from "@/ipc/defaults.gen";
import type { Settings, SystemPreferences } from "@/ipc/bindings";

import { FIRST_FRAME_GLOBAL, readFirstFrame } from "./firstFrame";

const darkSettings: Settings = {
  ...defaultSettings,
  appearance: { ...defaultSettings.appearance, theme: "dark" },
};
const greek: SystemPreferences = { textScalePercent: 150, locale: "el-GR" };

/** Runs the page as Tauri does, and records every command it sends to Rust. */
function runInTauri() {
  Object.assign(globalThis, { isTauri: true });
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "get_settings") return darkSettings;
    if (command === "get_system_preferences") return greek;
    return null;
  });
  return commands;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
  Reflect.deleteProperty(globalThis, FIRST_FRAME_GLOBAL);
});

describe("readFirstFrame", () => {
  it("uses what Rust handed to the page when it made the window, without asking Rust", async () => {
    const commands = runInTauri();
    Object.assign(globalThis, {
      [FIRST_FRAME_GLOBAL]: { settings: darkSettings, systemPreferences: greek },
    });

    await expect(readFirstFrame()).resolves.toEqual({
      settings: darkSettings,
      systemPreferences: greek,
    });
    expect(commands).toEqual([]);
  });

  it("takes what was handed over once, so nothing later reads it after it is out of date", async () => {
    runInTauri();
    Object.assign(globalThis, {
      [FIRST_FRAME_GLOBAL]: { settings: darkSettings, systemPreferences: greek },
    });

    await readFirstFrame();

    expect(FIRST_FRAME_GLOBAL in globalThis).toBe(false);
  });

  it("asks Rust when nothing was handed over", async () => {
    const commands = runInTauri();

    await expect(readFirstFrame()).resolves.toEqual({
      settings: darkSettings,
      systemPreferences: greek,
    });
    expect(commands.toSorted()).toEqual(["get_settings", "get_system_preferences"]);
  });

  it("starts with the defaults when Rust cannot answer", async () => {
    Object.assign(globalThis, { isTauri: true });
    mockIPC(() => {
      throw new Error("no answer");
    });

    const { settings, systemPreferences } = await readFirstFrame();

    expect(settings).toEqual(defaultSettings);
    expect(systemPreferences.textScalePercent).toBe(100);
  });

  it("starts with the defaults outside Tauri, such as in a browser", async () => {
    const { settings, systemPreferences } = await readFirstFrame();

    expect(settings).toEqual(defaultSettings);
    expect(systemPreferences.textScalePercent).toBe(100);
  });
});
