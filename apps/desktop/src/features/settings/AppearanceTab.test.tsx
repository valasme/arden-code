import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import type { Settings } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { AppearanceTab } from "./AppearanceTab";
import { SettingsSync } from "./SettingsSync";

import "@/styles/global.css";

const settingsWith = (theme: "system" | "light" | "dark"): Settings => ({
  version: 1,
  appearance: { theme },
});

const change = z.object({
  change: z.object({ appearanceTheme: z.enum(["system", "light", "dark"]) }),
});

interface Options {
  theme?: "system" | "light" | "dark";
  /** How long saving takes, so a test can look at the screen while it is still in progress. */
  savingTakes?: number;
  /** Makes saving fail the way Rust reports it: JSON text carrying the error. */
  failToSave?: boolean;
}

function startApp({ theme = "system", savingTakes = 0, failToSave = false }: Options = {}) {
  Object.assign(globalThis, { isTauri: true });
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    async (command, payload) => {
      calls.push({ command, payload });
      if (command === "get_settings") return settingsWith(theme);
      if (command === "take_settings_notice") return null;
      if (command === "change_setting") {
        await new Promise((resolve) => setTimeout(resolve, savingTakes));
        if (failToSave) {
          throw JSON.stringify({
            code: "ARD-SET-001",
            messageKey: "errors.ARD-SET-001",
            details: "disk is full",
          });
        }
        return settingsWith(change.parse(payload).change.appearanceTheme);
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderTab() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsSync />
      <AppearanceTab />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Appearance → Theme", () => {
  it("offers the three themes, with the current one chosen", async () => {
    startApp({ theme: "dark" });
    renderTab();

    // The settings arrive from Rust a moment after the tab draws.
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    });
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Same as Windows" })).not.toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });

  it("applies a choice at once, before the save has finished, and then saves it", async () => {
    const calls = startApp({ savingTakes: 400 });
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("radio", { name: "Same as Windows" });

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    // The save takes 400 ms, and the screen has not waited for it.
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await waitFor(() => {
      expect(calls.find((call) => call.command === "change_setting")?.payload).toEqual({
        change: { appearanceTheme: "dark" },
      });
    });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("puts the old choice back and shows the error code when saving fails", async () => {
    startApp({ theme: "light", failToSave: true });
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("radio", { name: "Light" });

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    });
    expect(await screen.findByText("Something went wrong (ARD-SET-001)")).toBeInTheDocument();
  });

  it("follows a change made somewhere else, such as a hand edit of the file", async () => {
    startApp({ theme: "light" });
    renderTab();
    await screen.findByRole("radio", { name: "Light" });

    await emit("settings-changed", { settings: settingsWith("dark"), notice: null });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    });
  });

  it("has no accessibility violations", async () => {
    startApp();
    const { container } = renderTab();
    await screen.findByRole("radio", { name: "Dark" });

    await expectNoAccessibilityViolations(container);
  });
});
