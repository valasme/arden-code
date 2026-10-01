import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, waitFor } from "@testing-library/react";

import type { Settings, SystemPreferences } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";
import { settingsQuery, systemPreferencesQuery } from "@/ipc/queries";

import { SettingsSync } from "./SettingsSync";
import { SystemPreferencesSync } from "./SystemPreferencesSync";

// The page starts with what Rust handed over when it made the window. A change made before the page
// listened sent no event it heard, so both are read again once the page listens.

const darkSettings: Settings = {
  ...defaultSettings,
  appearance: { ...defaultSettings.appearance, theme: "dark" },
};
const before: SystemPreferences = { textScalePercent: 100, locale: "en-US" };
const now: SystemPreferences = { textScalePercent: 150, locale: "el-GR" };

/**
 * Runs the two components as Tauri does and records, in order, what they ask Rust. `settingsAnswer`
 * is what reading the settings returns, so a test can hold the answer back.
 */
function startWith(client: QueryClient, settingsAnswer: () => Promise<Settings> | Settings) {
  Object.assign(globalThis, { isTauri: true });
  const asked: string[] = [];
  mockIPC((command, payload) => {
    if (command === "plugin:event|listen") {
      const event = typeof payload === "object" && "event" in payload ? payload.event : undefined;
      asked.push(`listen ${String(event)}`);
      return asked.length;
    }
    asked.push(command);
    if (command === "get_settings") return settingsAnswer();
    if (command === "get_system_preferences") return now;
    return null;
  });
  render(
    <QueryClientProvider client={client}>
      <SettingsSync />
      <SystemPreferencesSync />
    </QueryClientProvider>,
  );
  return asked;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("keeping the page in step with Rust", () => {
  it("reads the settings again once it listens for changes, not before", async () => {
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, defaultSettings);

    const asked = startWith(client, () => darkSettings);

    await waitFor(() => {
      expect(client.getQueryData(settingsQuery.queryKey)).toEqual(darkSettings);
    });
    expect(asked.indexOf("listen settings-changed")).toBeGreaterThanOrEqual(0);
    expect(asked.indexOf("listen settings-changed")).toBeLessThan(asked.indexOf("get_settings"));
  });

  it("reads Windows' text size and regional format again once it listens for changes", async () => {
    const client = new QueryClient();
    client.setQueryData(systemPreferencesQuery.queryKey, before);

    const asked = startWith(client, () => defaultSettings);

    await waitFor(() => {
      expect(client.getQueryData(systemPreferencesQuery.queryKey)).toEqual(now);
    });
    expect(asked.indexOf("listen system-preferences-changed")).toBeLessThan(
      asked.indexOf("get_system_preferences"),
    );
  });

  it("does not undo a change made while the settings were being read again", async () => {
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, defaultSettings);
    let answer: ((settings: Settings) => void) | undefined;
    const asked = startWith(
      client,
      () =>
        new Promise<Settings>((resolve) => {
          answer = resolve;
        }),
    );
    await waitFor(() => {
      expect(asked).toContain("get_settings");
    });

    // The person changes a setting; the UI shows it at once, before Rust has answered the read.
    client.setQueryData(settingsQuery.queryKey, darkSettings);
    answer?.(defaultSettings);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(client.getQueryData(settingsQuery.queryKey)).toEqual(darkSettings);
  });
});
