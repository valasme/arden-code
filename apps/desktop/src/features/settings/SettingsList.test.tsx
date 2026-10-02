import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import type { SettingKey, Settings, SystemPreferences } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { SettingsList } from "./SettingsList";
import { SettingsSync } from "./SettingsSync";
import { SystemPreferencesSync } from "./SystemPreferencesSync";
import type { SettingsTab } from "./tabs";

import "@/styles/global.css";

/** Where each change lands in the settings, written out here so the test does not rely on the app. */
const places = {
  generalOnStartup: ["general", "onStartup"],
  generalCheckForUpdates: ["general", "checkForUpdates"],
  generalRegionalFormat: ["general", "regionalFormat"],
  appearanceTheme: ["appearance", "theme"],
  appearanceZoom: ["appearance", "zoom"],
  appearanceFollowTextSize: ["appearance", "followTextSize"],
  appearanceCodeFontSize: ["appearance", "codeFontSize"],
  appearanceCodeLigatures: ["appearance", "codeLigatures"],
  appearanceReduceMotion: ["appearance", "reduceMotion"],
  appearanceShowStatusBar: ["appearance", "showStatusBar"],
  layoutSidebarWidth: ["layout", "sidebarWidth"],
  layoutInspectorWidth: ["layout", "inspectorWidth"],
  notificationsDesktop: ["notifications", "desktop"],
  advancedLogLevel: ["advanced", "logLevel"],
  advancedDeveloperMode: ["advanced", "developerMode"],
  advancedNativeTitleBar: ["advanced", "nativeTitleBar"],
  advancedHardwareAcceleration: ["advanced", "hardwareAcceleration"],
} as const satisfies Record<SettingKey, readonly [keyof Settings, string]>;

const changeSchema = z.object({ change: z.record(z.string(), z.unknown()) });
const resetSchema = z.object({ key: z.string() });

/** A copy of the settings with one value replaced. */
function withValue(settings: Settings, key: SettingKey, value: unknown): Settings {
  const [group, name] = places[key];
  const copy = structuredClone(settings);
  Reflect.set(copy[group], name, value);
  return copy;
}

function valueOf(settings: Settings, key: SettingKey): unknown {
  const [group, name] = places[key];
  return Reflect.get(settings[group], name);
}

function isSettingKey(key: string): key is SettingKey {
  return key in places;
}

interface Options {
  settings?: Settings;
  /** What Windows says about the text size and the regional format. */
  system?: SystemPreferences;
  /** How long saving takes, so a test can look at the screen while it is still in progress. */
  savingTakes?: number;
  /** Makes saving fail the way Rust reports it: JSON text carrying the error. */
  failToSave?: boolean;
}

function startApp({
  settings = settingsWith(),
  system = { textScalePercent: 100, locale: "en-US" },
  savingTakes = 0,
  failToSave = false,
}: Options = {}) {
  Object.assign(globalThis, { isTauri: true });
  let current = settings;
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    async (command, payload) => {
      calls.push({ command, payload });
      if (command === "get_settings") return current;
      if (command === "take_settings_notice") return null;
      if (command === "get_system_preferences") return system;
      if (command === "change_setting") {
        await new Promise((resolve) => setTimeout(resolve, savingTakes));
        if (failToSave) {
          throw JSON.stringify({
            code: "ARD-SET-001",
            messageKey: "errors.ARD-SET-001",
            details: "disk is full",
          });
        }
        const entry = Object.entries(changeSchema.parse(payload).change)[0];
        if (entry === undefined || !isSettingKey(entry[0])) throw new Error("unknown setting");
        current = withValue(current, entry[0], entry[1]);
        return current;
      }
      if (command === "reset_setting") {
        const { key } = resetSchema.parse(payload);
        if (!isSettingKey(key)) throw new Error(`unknown setting ${key}`);
        current = withValue(current, key, valueOf(defaultSettings, key));
        return current;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderTab(tab: SettingsTab) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsSync />
      <SystemPreferencesSync />
      <SettingsList tab={tab} />
      <Toaster />
    </QueryClientProvider>,
  );
}

const savedChange = (calls: { command: string; payload: unknown }[]) =>
  calls.find((call) => call.command === "change_setting")?.payload;

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("General → On startup", () => {
  it("offers to restore the last session or start fresh, and restores by default", async () => {
    startApp();
    renderTab("general");

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Restore the last session" })).toBeChecked();
    });
    expect(screen.getByRole("radio", { name: "Start fresh" })).not.toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "On startup" })).toBeVisible();
  });

  it("saves the choice", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("general");
    await screen.findByRole("radio", { name: "Start fresh" });

    await user.click(screen.getByRole("radio", { name: "Start fresh" }));

    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { generalOnStartup: "fresh" } });
    });
    expect(screen.getByRole("radio", { name: "Start fresh" })).toBeChecked();
  });
});

describe("General → Check for updates automatically", () => {
  it("is on by default, and saves a switch off", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("general");
    const toggle = await screen.findByRole("switch", { name: "Check for updates automatically" });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { generalCheckForUpdates: false } });
    });
    expect(toggle).not.toBeChecked();
  });
});

describe("General → Regional format", () => {
  it("follows Windows by default, and shows an example written that way", async () => {
    startApp({ system: { textScalePercent: 100, locale: "el-GR" } });
    renderTab("general");

    const group = await screen.findByRole("radiogroup", { name: "Regional format" });

    expect(within(group).getByRole("radio", { name: "Same as Windows" })).toBeChecked();
    // A Greek regional format, although the text of the interface is English.
    expect(
      await screen.findByText("Example: 30/9/2026, 1.234.567,89, πριν από 5 λεπτά"),
    ).toBeVisible();
  });

  it("can be set to English (US), which changes the example at once and is saved", async () => {
    const calls = startApp({ system: { textScalePercent: 100, locale: "el-GR" } });
    const user = userEvent.setup();
    renderTab("general");
    await screen.findByText(/^Example: 30\/9\/2026/);

    await user.click(screen.getByRole("radio", { name: "English (US)" }));

    expect(
      await screen.findByText("Example: 9/30/2026, 1,234,567.89, 5 minutes ago"),
    ).toBeVisible();
    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { generalRegionalFormat: "english" } });
    });
  });

  it("follows a change of the Windows regional format while the app runs", async () => {
    startApp({ system: { textScalePercent: 100, locale: "de-DE" } });
    renderTab("general");
    await screen.findByText(/^Example: 30\.9\.2026/);

    await emit("system-preferences-changed", {
      preferences: { textScalePercent: 100, locale: "en-GB" },
    });

    expect(await screen.findByText(/^Example: 30\/09\/2026, 1,234,567\.89/)).toBeVisible();
  });
});

describe("Appearance → Follow Windows text size", () => {
  it("is on by default, and saves a switch off", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const toggle = await screen.findByRole("switch", { name: "Follow Windows text size" });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { appearanceFollowTextSize: false } });
    });
    expect(toggle).not.toBeChecked();
  });
});

describe("Appearance → Theme", () => {
  it("offers the three themes, with the current one chosen", async () => {
    startApp({ settings: settingsWith({ appearance: { theme: "dark" } }) });
    renderTab("appearance");

    // The settings arrive from Rust a moment after the tab draws.
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    });
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getByRole("radio", { name: "Same as Windows" })).not.toBeChecked();
  });

  it("applies a choice at once, before the save has finished, and then saves it", async () => {
    const calls = startApp({ savingTakes: 400 });
    const user = userEvent.setup();
    renderTab("appearance");
    await screen.findByRole("radio", { name: "Dark" });

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    // The save takes 400 ms, and the screen has not waited for it.
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { appearanceTheme: "dark" } });
    });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("puts the old choice back and shows the error code when saving fails", async () => {
    startApp({ settings: settingsWith({ appearance: { theme: "light" } }), failToSave: true });
    const user = userEvent.setup();
    renderTab("appearance");
    await screen.findByRole("radio", { name: "Light" });

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    });
    expect(await screen.findByText("Something went wrong (ARD-SET-001)")).toBeInTheDocument();
  });

  it("follows a change made somewhere else, such as a hand edit of the file", async () => {
    startApp({ settings: settingsWith({ appearance: { theme: "light" } }) });
    renderTab("appearance");
    await screen.findByRole("radio", { name: "Light" });

    await emit("settings-changed", {
      settings: settingsWith({ appearance: { theme: "dark" } }),
      notice: null,
    });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    });
  });
});

describe("Appearance → Zoom and Code font size", () => {
  it("shows the zoom as a slider from 80 to 200 percent, read out with its unit", async () => {
    startApp({ settings: settingsWith({ appearance: { zoom: 125 } }) });
    renderTab("appearance");

    const slider = await screen.findByRole("slider", { name: "Zoom" });

    await waitFor(() => {
      expect(slider).toHaveAttribute("aria-valuenow", "125");
    });
    expect(slider).toHaveAttribute("aria-valuemin", "80");
    expect(slider).toHaveAttribute("aria-valuemax", "200");
    expect(slider).toHaveAttribute("aria-valuetext", "125%");
  });

  it("saves the zoom when a key moves the slider", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const slider = await screen.findByRole("slider", { name: "Zoom" });

    slider.focus();
    await user.keyboard("{ArrowRight}");

    await waitFor(() => {
      expect(savedChange(calls)).toEqual({ change: { appearanceZoom: 105 } });
    });
    expect(slider).toHaveAttribute("aria-valuenow", "105");
  });

  it("shows the code font size from 11 to 20 px and saves a new one", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const slider = await screen.findByRole("slider", { name: "Code font size" });
    expect(slider).toHaveAttribute("aria-valuemin", "11");
    expect(slider).toHaveAttribute("aria-valuemax", "20");
    expect(slider).toHaveAttribute("aria-valuetext", "13 px");

    slider.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    await waitFor(() => {
      expect(calls.findLast((call) => call.command === "change_setting")?.payload).toEqual({
        change: { appearanceCodeFontSize: 15 },
      });
    });
  });

  it("shows a sample of code so the effect can be judged", async () => {
    startApp();
    renderTab("appearance");

    expect(await screen.findByText(/items\.filter/)).toBeVisible();
  });
});

describe("Appearance → the switches and Reduce motion", () => {
  it("has ligatures off and the status bar on by default, and saves each", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const ligatures = await screen.findByRole("switch", { name: "Code ligatures" });
    const statusBar = screen.getByRole("switch", { name: "Show status bar" });
    expect(ligatures).not.toBeChecked();
    expect(statusBar).toBeChecked();

    await user.click(ligatures);
    await user.click(statusBar);

    await waitFor(() => {
      expect(
        calls.filter((call) => call.command === "change_setting").map((call) => call.payload),
      ).toEqual([
        { change: { appearanceCodeLigatures: true } },
        { change: { appearanceShowStatusBar: false } },
      ]);
    });
  });

  it("follows Windows by default and can be set to on or off", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const group = await screen.findByRole("radiogroup", { name: "Reduce motion" });
    expect(group).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Reduce" }));
    await user.click(screen.getByRole("radio", { name: "Do not reduce" }));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.command === "change_setting").map((call) => call.payload),
      ).toEqual([
        { change: { appearanceReduceMotion: "on" } },
        { change: { appearanceReduceMotion: "off" } },
      ]);
    });
  });
});

describe("Resetting a setting", () => {
  it("offers a reset only for a setting that is not at its default", async () => {
    startApp({ settings: settingsWith({ appearance: { zoom: 150 } }) });
    renderTab("appearance");

    expect(await screen.findByRole("button", { name: "Reset Zoom to its default" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reset Theme to its default" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reset Code font size/ })).toBeNull();
  });

  it("puts that setting back to its default, and only that one", async () => {
    const calls = startApp({
      settings: settingsWith({ appearance: { zoom: 150, theme: "dark" } }),
    });
    const user = userEvent.setup();
    renderTab("appearance");

    await user.click(await screen.findByRole("button", { name: "Reset Zoom to its default" }));

    await waitFor(() => {
      expect(screen.getByRole("slider", { name: "Zoom" })).toHaveAttribute("aria-valuenow", "100");
    });
    expect(calls.find((call) => call.command === "reset_setting")?.payload).toEqual({
      key: "appearanceZoom",
    });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Reset Zoom to its default" })).toBeNull();
    // The button that was pressed is gone, so focus goes to the setting instead of being lost.
    await waitFor(() => {
      expect(screen.getByRole("slider", { name: "Zoom" })).toHaveFocus();
    });
  });

  it("works for every kind of setting", async () => {
    startApp({
      settings: settingsWith({
        general: { onStartup: "fresh", checkForUpdates: false },
        appearance: { codeLigatures: true, showStatusBar: false, reduceMotion: "on" },
      }),
    });
    const user = userEvent.setup();
    const general = renderTab("general");

    await user.click(await screen.findByRole("button", { name: /Reset On startup/ }));
    await user.click(await screen.findByRole("button", { name: /Reset Check for updates/ }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Restore the last session" })).toBeChecked();
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: /Check for updates/ })).toBeChecked();
    });
    general.unmount();
  });
});

describe("The settings tabs", () => {
  it.each(["general", "appearance"] as const)("%s has no accessibility violations", async (tab) => {
    startApp();
    const { container } = renderTab(tab);
    await screen.findAllByRole("heading", { level: 2 });

    await expectNoAccessibilityViolations(container);
  });

  it("has none while a setting can be reset either", async () => {
    startApp({ settings: settingsWith({ appearance: { zoom: 150, codeLigatures: true } }) });
    const { container } = renderTab("appearance");
    await screen.findByRole("button", { name: "Reset Zoom to its default" });

    await expectNoAccessibilityViolations(container);
  });
});

describe("The layout of a tab", () => {
  it("draws each setting as one row of a bordered list, its control at the end of the row", async () => {
    startApp();
    renderTab("appearance");
    const toggle = await screen.findByRole("switch", { name: "Show status bar" });
    const list = screen.getByRole("list", { name: "Appearance" });
    const row = toggle.closest("li");
    if (!row) throw new Error("the setting is not a row of the list");

    expect(getComputedStyle(list).borderTopWidth).toBe("1px");
    // The switch sits at the end of its row, beside the name rather than under it.
    const name = within(row).getByRole("heading", { name: "Show status bar" });
    expect(row.getBoundingClientRect().right - toggle.getBoundingClientRect().right).toBeLessThan(
      24,
    );
    expect(toggle.getBoundingClientRect().top).toBeLessThan(name.getBoundingClientRect().bottom);
  });

  it("moves nothing when a change makes a setting's reset button appear", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const ligatures = await screen.findByRole("switch", { name: "Code ligatures" });
    const list = screen.getByRole("list", { name: "Appearance" });
    const layout = () =>
      [...list.querySelectorAll("h2, p, [role=radio], [role=switch], [role=slider]")].map(
        (element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        },
      );
    const before = layout();

    await user.click(ligatures);

    await screen.findByRole("button", { name: "Reset Code ligatures to its default" });
    expect(layout()).toEqual(before);
  });

  it("keeps the options of a choice the same size, whichever is chosen", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab("appearance");
    const theme = await screen.findByRole("radiogroup", { name: "Theme" });
    const widths = () =>
      within(theme)
        .getAllByRole("radio")
        .map((option) => option.getBoundingClientRect().width);
    const before = widths();

    await user.click(within(theme).getByRole("radio", { name: "Dark" }));

    await waitFor(() => {
      expect(within(theme).getByRole("radio", { name: "Dark" })).toBeChecked();
    });
    expect(widths()).toEqual(before);
  });
});
