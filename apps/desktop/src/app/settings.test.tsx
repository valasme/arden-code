import { createMemoryHistory } from "@tanstack/react-router";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import type { AppError, Settings } from "@/ipc/bindings";

import { App } from "./App";

import "@/styles/global.css";

const settingsWith = (theme: "system" | "light" | "dark"): Settings => ({
  version: 1,
  appearance: { theme },
});

const invalidNotice: AppError = {
  code: "ARD-SET-002",
  messageKey: "errors.ARD-SET-002",
  details: "the file is not valid JSON",
};

function startApp({
  theme = "system",
  notice = null,
}: { theme?: "system" | "light" | "dark"; notice?: AppError | null } = {}) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  mockIPC(
    (command) => {
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "get_settings") return settingsWith(theme);
      if (command === "take_settings_notice") return notice;
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

    await emit("settings-changed", { settings: settingsWith("dark"), notice: null });

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

    await emit("settings-changed", { settings: settingsWith("system"), notice: invalidNotice });

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
