import { createMemoryHistory } from "@tanstack/react-router";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import type { AppError, Settings, SystemPreferences } from "@/ipc/bindings";
import { settingsWith } from "@/test/settings";

import { App } from "./App";

import "@/styles/global.css";

const settingsForTheme = (theme: Settings["appearance"]["theme"]) =>
  settingsWith({ appearance: { theme } });

const invalidNotice: AppError = {
  code: "ARD-SET-002",
  messageKey: "errors.ARD-SET-002",
  details: "the file is not valid JSON",
};

function startApp({
  theme = "system",
  notice = null,
  settings = settingsForTheme(theme),
  savedAs = settings,
  system = { textScalePercent: 100, locale: "en-US" },
}: {
  theme?: "system" | "light" | "dark";
  notice?: AppError | null;
  settings?: Settings;
  /** What saving a change answers with. */
  savedAs?: Settings;
  /** What Windows says about the text size and the regional format. */
  system?: SystemPreferences;
} = {}) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  mockIPC(
    (command) => {
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "get_settings") return settings;
      if (command === "change_setting") return savedAs;
      if (command === "take_settings_notice") return notice;
      if (command === "get_system_preferences") return system;
      return null;
    },
    { shouldMockEvents: true },
  );
}

const root = document.documentElement;

afterEach(() => {
  // Toasts live in a global store, so one test's notice would otherwise show up in the next.
  toast.dismiss();
  Reflect.deleteProperty(globalThis, "isTauri");
  root.classList.remove("dark", "light");
  root.removeAttribute("style");
  root.removeAttribute("data-motion");
});

function renderApp(path = "/") {
  return render(<App history={createMemoryHistory({ initialEntries: [path] })} />);
}

describe("the theme setting", () => {
  it("is applied to the whole app", async () => {
    startApp({ theme: "dark" });

    renderApp();

    await waitFor(() => {
      expect(root).toHaveClass("dark");
    });
  });

  it("changes the theme as soon as the setting changes, without a restart", async () => {
    startApp({ theme: "light" });
    renderApp();
    await waitFor(() => {
      expect(root).toHaveClass("light");
    });

    await emit("settings-changed", { settings: settingsForTheme("dark"), notice: null });

    await waitFor(() => {
      expect(root).toHaveClass("dark");
    });
    expect(root).not.toHaveClass("light");
  });
});

describe("a settings file that could not be used", () => {
  it("shows a quiet notice with the error code when the app starts", async () => {
    startApp({ notice: invalidNotice });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/ARD-SET-002/)).toBeVisible();
    });
    expect(
      screen.getByText("The settings file was not valid, so the default settings are in use."),
    ).toBeVisible();
  });

  it("shows the same notice when the file breaks while the app runs", async () => {
    startApp();
    renderApp();
    await screen.findByRole("main");

    await emit("settings-changed", { settings: settingsForTheme("system"), notice: invalidNotice });

    await waitFor(() => {
      expect(screen.getByText(/ARD-SET-002/)).toBeVisible();
    });
  });

  it("shows nothing when the file was fine", async () => {
    startApp();
    renderApp();
    await screen.findByRole("main");

    expect(screen.queryByText(/ARD-SET-002/)).toBeNull();
  });
});

describe("the Settings page", () => {
  it("lists every tab, and marks the one that is open", async () => {
    startApp();
    renderApp("/settings/appearance");
    await screen.findByRole("heading", { level: 1, name: "Appearance" });
    const tabs = screen.getByRole("navigation", { name: "Settings sections" });

    const links = Array.from(tabs.querySelectorAll("a")).map((link) => link.textContent);
    expect(links).toEqual([
      "General",
      "Appearance",
      "Keyboard",
      "Notifications",
      "Agents",
      "Advanced",
      "About",
    ]);
    expect(screen.getByRole("link", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "General" })).not.toHaveAttribute("aria-current");
  });

  it("moves between tabs", async () => {
    startApp();
    renderApp("/settings/general");
    await screen.findByRole("heading", { level: 1, name: "General" });

    screen.getByRole("link", { name: "Advanced" }).click();

    expect(await screen.findByRole("heading", { level: 1, name: "Advanced" })).toBeVisible();
  });

  it("says so on a tab whose settings are not there yet", async () => {
    startApp();
    renderApp("/settings/keyboard");

    expect(await screen.findByText("These settings arrive in a later update.")).toBeVisible();
  });

  it("has the theme control on the Appearance tab", async () => {
    startApp();
    renderApp("/settings/appearance");

    expect(await screen.findByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });
});

const property = (name: string) => root.style.getPropertyValue(name);

describe("the appearance settings", () => {
  it("scale the whole window with the zoom, live", async () => {
    startApp({ settings: settingsWith({ appearance: { zoom: 150 } }) });
    renderApp();

    await waitFor(() => {
      expect(property("--zoom")).toBe("1.5");
    });
    // Every size is in rem, so the root size is what the zoom changes: 16px times 1.5.
    expect(getComputedStyle(root).fontSize).toBe("24px");

    await emit("settings-changed", {
      settings: settingsWith({ appearance: { zoom: 80 } }),
      notice: null,
    });

    await waitFor(() => {
      expect(getComputedStyle(root).fontSize).toBe("12.8px");
    });
  });

  it("show text at 100% zoom as the type scale says: 13px for the interface, 12px for small text", async () => {
    startApp();
    renderApp("/settings/appearance");
    await screen.findByRole("heading", { level: 1, name: "Appearance" });

    expect(getComputedStyle(root).fontSize).toBe("16px");
    expect(getComputedStyle(document.body).fontSize).toBe("13px");
    const description = screen.getByText(/Light or dark, or the same as Windows/);
    expect(getComputedStyle(description).fontSize).toBe("12px");
  });

  it("size code by the code font size, in rem so the zoom applies to it too", async () => {
    startApp({ settings: settingsWith({ appearance: { codeFontSize: 16, zoom: 125 } }) });
    renderApp("/settings/appearance");
    const code = await screen.findByText(/items.filter/);

    await waitFor(() => {
      expect(property("--code-font-size")).toBe("1rem");
    });
    // 16px at 125% zoom.
    expect(getComputedStyle(code).fontSize).toBe("20px");
  });

  it("turn code ligatures on and off", async () => {
    startApp({ settings: settingsWith({ appearance: { codeLigatures: true } }) });
    renderApp("/settings/appearance");
    const code = await screen.findByText(/items.filter/);

    await waitFor(() => {
      expect(getComputedStyle(code).fontVariantLigatures).toBe("normal");
    });

    await emit("settings-changed", {
      settings: settingsWith({ appearance: { codeLigatures: false } }),
      notice: null,
    });

    await waitFor(() => {
      expect(getComputedStyle(code).fontVariantLigatures).toBe("none");
    });
  });

  it("reduce motion when the setting says so, and only then", async () => {
    startApp({ settings: settingsWith({ appearance: { reduceMotion: "on" } }) });
    renderApp();
    await waitFor(() => {
      expect(root.dataset["motion"]).toBe("reduce");
    });
    // Animations and transitions end at once.
    const style = getComputedStyle(await screen.findByRole("main"));
    expect(Number.parseFloat(style.transitionDuration)).toBeLessThan(0.001);

    await emit("settings-changed", {
      settings: settingsWith({ appearance: { reduceMotion: "off" } }),
      notice: null,
    });

    await waitFor(() => {
      expect(root.dataset["motion"]).toBe("full");
    });
  });

  it("hide and show the status bar", async () => {
    startApp({ settings: settingsWith({ appearance: { showStatusBar: false } }) });
    renderApp();
    await screen.findByRole("main");

    expect(screen.queryByRole("contentinfo")).toBeNull();

    await emit("settings-changed", { settings: settingsWith(), notice: null });

    expect(await screen.findByRole("contentinfo")).toBeVisible();
  });
});

async function search(text: string) {
  const user = userEvent.setup();
  renderApp("/settings/general");
  await screen.findByRole("heading", { level: 1, name: "General" });
  await user.type(screen.getByRole("searchbox", { name: "Search settings" }), text);
  return user;
}

describe("searching the settings", () => {
  it("finds a setting by its name, on any tab", async () => {
    startApp();

    await search("zoom");

    const results = await screen.findByRole("list", { name: "Search results" });
    expect(
      within(results)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Zoom"]);
    expect(within(results).getByRole("slider", { name: "Zoom" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("finds a setting by a word in its description", async () => {
    startApp();

    await search("windows");

    const results = await screen.findByRole("list", { name: "Search results" });
    expect(
      within(results)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Theme", "Follow Windows text size", "Reduce motion"]);
  });

  it("says when nothing matches, and goes back to the tab when the search is cleared", async () => {
    startApp();
    const user = await search("qqqq");
    expect(await screen.findByText("No setting matches.")).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search settings" }));

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });

  it("lets a found setting be changed right there", async () => {
    const user = userEvent.setup();
    startApp({ savedAs: settingsWith({ general: { onStartup: "fresh" } }) });
    renderApp("/settings/general");
    await screen.findByRole("heading", { level: 1, name: "General" });
    await user.type(screen.getByRole("searchbox", { name: "Search settings" }), "startup");

    await user.click(await screen.findByRole("radio", { name: "Start fresh" }));

    expect(screen.getByRole("radio", { name: "Start fresh" })).toBeChecked();
  });
});

describe("the Windows text size", () => {
  it("scales the whole window, on top of the zoom", async () => {
    startApp({
      settings: settingsWith({ appearance: { zoom: 150 } }),
      system: { textScalePercent: 125, locale: "en-US" },
    });
    renderApp();

    await waitFor(() => {
      expect(property("--zoom")).toBe("1.875");
    });
    // 16px times 1.5 times 1.25.
    expect(getComputedStyle(root).fontSize).toBe("30px");
  });

  it("is left out when the setting says not to follow it", async () => {
    startApp({
      settings: settingsWith({ appearance: { followTextSize: false } }),
      system: { textScalePercent: 225, locale: "en-US" },
    });
    renderApp();

    await waitFor(() => {
      expect(property("--zoom")).toBe("1");
    });
    expect(getComputedStyle(root).fontSize).toBe("16px");
  });

  it("changes live, when the person changes it in Windows", async () => {
    startApp();
    renderApp();
    await waitFor(() => {
      expect(getComputedStyle(root).fontSize).toBe("16px");
    });

    await emit("system-preferences-changed", {
      preferences: { textScalePercent: 150, locale: "en-US" },
    });

    await waitFor(() => {
      expect(getComputedStyle(root).fontSize).toBe("24px");
    });
  });

  it("follows the setting too: turning it off brings the normal size back at once", async () => {
    startApp({ system: { textScalePercent: 150, locale: "en-US" } });
    renderApp();
    await waitFor(() => {
      expect(getComputedStyle(root).fontSize).toBe("24px");
    });

    await emit("settings-changed", {
      settings: settingsWith({ appearance: { followTextSize: false } }),
      notice: null,
    });

    await waitFor(() => {
      expect(getComputedStyle(root).fontSize).toBe("16px");
    });
  });
});
