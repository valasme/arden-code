import { isTauri } from "@tauri-apps/api/core";

import { fallbackSystemPreferences } from "@/features/settings/systemPreferences";
import { commands, type Settings, type SystemPreferences } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";

/**
 * Where Rust puts what the first frame needs, in a script that runs before the page's own code
 * (`first_frame_script` in `window.rs`). Both sides must use the same name; a contract test checks.
 */
export const FIRST_FRAME_GLOBAL = "__ARDEN_FIRST_FRAME__";

/** What the first frame is drawn with: the settings, and Windows' text size and regional format. */
export interface FirstFrame {
  settings: Settings;
  systemPreferences: SystemPreferences;
}

/** Rust makes it from the same types the commands return, so its shape is all there is to check. */
function isFirstFrame(value: unknown): value is FirstFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "settings" in value &&
    "systemPreferences" in value
  );
}

/** Takes what Rust handed over, once, so nothing reads it later when it may be out of date. */
function takeHandedOver(): FirstFrame | undefined {
  const handedOver: unknown = Reflect.get(globalThis, FIRST_FRAME_GLOBAL);
  Reflect.deleteProperty(globalThis, FIRST_FRAME_GLOBAL);
  return isFirstFrame(handedOver) ? handedOver : undefined;
}

async function readSettings(): Promise<Settings> {
  if (!isTauri()) return defaultSettings;
  try {
    return await commands.getSettings();
  } catch {
    return defaultSettings;
  }
}

async function readSystemPreferences(): Promise<SystemPreferences> {
  if (!isTauri()) return fallbackSystemPreferences();
  try {
    return await commands.getSystemPreferences();
  } catch {
    return fallbackSystemPreferences();
  }
}

/**
 * The settings and system preferences for the first frame. Rust hands them to the page when it makes
 * the window, so the first frame does not wait for a round trip to Rust. Without them, such as in a
 * browser, they are asked for, and the defaults stand in when there is no answer.
 */
export async function readFirstFrame(): Promise<FirstFrame> {
  const handedOver = takeHandedOver();
  if (handedOver) return handedOver;
  const [settings, systemPreferences] = await Promise.all([
    readSettings(),
    readSystemPreferences(),
  ]);
  return { settings, systemPreferences };
}
