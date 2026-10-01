import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, waitFor } from "@testing-library/react";

import type { Settings, SystemPreferences } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";
import { settingsQuery, systemPreferencesQuery } from "@/ipc/queries";

import { SettingsSync } from "./SettingsSync";
import { SystemPreferencesSync } from "./SystemPreferencesSync";

// The page starts with what Rust handed over when it made the window. After the page is reloaded
// (when its web engine process stopped, say) that is out of date, and a change made before the
// page listened sent no event it heard. So both are read again once the page listens.

const darkSettings: Settings = {
  ...defaultSettings,
  appearance: { ...defaultSettings.appearance, theme: "dark" },
};
const before: SystemPreferences = { textScalePercent: 100, locale: "en-US" };
const now: SystemPreferences = { textScalePercent: 150, locale: "el-GR" };

function startWith(client: QueryClient) {
  Object.assign(globalThis, { isTauri: true });
  mockIPC(
    (command) => {
      if (command === "get_settings") return darkSettings;
      if (command === "get_system_preferences") return now;
      return null;
    },
    { shouldMockEvents: true },
  );
  return render(
    <QueryClientProvider client={client}>
      <SettingsSync />
      <SystemPreferencesSync />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("keeping the page in step with Rust", () => {
  it("reads the settings again once it listens, in case they changed before", async () => {
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, defaultSettings);

    startWith(client);

    await waitFor(() => {
      expect(client.getQueryData(settingsQuery.queryKey)).toEqual(darkSettings);
    });
  });

  it("reads Windows' text size and regional format again once it listens", async () => {
    const client = new QueryClient();
    client.setQueryData(systemPreferencesQuery.queryKey, before);

    startWith(client);

    await waitFor(() => {
      expect(client.getQueryData(systemPreferencesQuery.queryKey)).toEqual(now);
    });
  });
});
