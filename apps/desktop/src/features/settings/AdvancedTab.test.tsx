import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import type { Settings } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { AdvancedTab } from "./AdvancedTab";

import "@/styles/global.css";

interface Options {
  settings?: Settings;
  /** What choosing a file answers with: a path, or nothing when the person cancels. */
  exportedTo?: string | null;
  imported?: Settings | null;
  failImport?: boolean;
  /** Where the diagnostics bundle was saved, or nothing when the person cancels. */
  diagnosticsTo?: string | null;
}

/** Rust as a test double, recording what the tab asks of it. */
function startApp({
  settings = settingsWith(),
  exportedTo = null,
  imported = null,
  failImport = false,
  diagnosticsTo = null,
}: Options = {}) {
  Object.assign(globalThis, { isTauri: true });
  let current = settings;
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "get_settings") return current;
      if (command === "change_setting") {
        // The tab only changes the advanced toggles here.
        const { change } = z.object({ change: z.record(z.string(), z.unknown()) }).parse(payload);
        const [key, value] = Object.entries(change)[0] ?? [];
        const advanced = { ...current.advanced };
        if (key === "advancedDeveloperMode") advanced.developerMode = Boolean(value);
        if (key === "advancedNativeTitleBar") advanced.nativeTitleBar = Boolean(value);
        if (key === "advancedHardwareAcceleration") advanced.hardwareAcceleration = Boolean(value);
        if (key === "advancedLogLevel")
          advanced.logLevel = z.enum(["error", "warn", "info", "debug"]).parse(value);
        current = { ...current, advanced };
        return current;
      }
      if (command === "export_settings") return exportedTo;
      if (command === "export_diagnostics") return diagnosticsTo;
      if (command === "import_settings") {
        if (failImport) {
          throw JSON.stringify({
            code: "ARD-SET-003",
            messageKey: "errors.ARD-SET-003",
            details: "the file is not valid JSON",
          });
        }
        if (imported) current = imported;
        return imported;
      }
      if (command === "reset_settings") {
        current = settingsWith();
        return current;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

const onViewLogs = vi.fn<() => void>();

function renderTab() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdvancedTab onViewLogs={onViewLogs} />
      <Toaster />
    </QueryClientProvider>,
  );
}

const asked = <Call extends { command: string }>(calls: Call[], command: string) =>
  calls.filter((call) => call.command === command);

afterEach(() => {
  toast.dismiss();
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Advanced → the switches", () => {
  it("are off, off and on by default", async () => {
    startApp();
    renderTab();

    expect(await screen.findByRole("switch", { name: "Developer mode" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Use the Windows title bar" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Hardware acceleration" })).toBeChecked();
  });

  it("save developer mode and the Windows title bar", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("switch", { name: "Developer mode" }));
    await user.click(screen.getByRole("switch", { name: "Use the Windows title bar" }));

    await waitFor(() => {
      expect(asked(calls, "change_setting").map((call) => call.payload)).toEqual([
        { change: { advancedDeveloperMode: true } },
        { change: { advancedNativeTitleBar: true } },
      ]);
    });
  });
});

describe("Advanced → Hardware acceleration", () => {
  it("asks whether to restart when it is turned off, and restarts when told to", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("switch", { name: "Hardware acceleration" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Restart Arden Code?" });
    await animationsDone(dialog);
    expect(
      within(dialog).getByText("Hardware acceleration changes the next time Arden Code starts."),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Later" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Restart now" }));
    await waitFor(() => {
      expect(asked(calls, "restart_app")).toHaveLength(1);
    });
  });

  it("keeps saying so after Later, with a way to restart from the row", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("switch", { name: "Hardware acceleration" }));

    await user.click(await screen.findByRole("button", { name: "Later" }));

    expect(await screen.findByText("Restart Arden Code to apply this.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restart now" }));
    await waitFor(() => {
      expect(asked(calls, "restart_app")).toHaveLength(1);
    });
  });

  it("needs no restart when it is put back the way the app started", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab();
    const toggle = await screen.findByRole("switch", { name: "Hardware acceleration" });
    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: "Later" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    await user.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText("Restart Arden Code to apply this.")).toBeNull();
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Advanced → files", () => {
  it("opens settings.json", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Open settings.json" }));

    await waitFor(() => {
      expect(asked(calls, "open_settings_file")).toHaveLength(1);
    });
  });

  it("exports the settings and says where they went", async () => {
    startApp({ exportedTo: "C:\\Users\\me\\Documents\\arden-code-settings.json" });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Export settings" }));

    await screen.findByText(/^Settings exported to C:/);
    // Notices fade in, so they only count as visible once the animation has started.
    await waitFor(() => {
      expect(screen.getByText(/^Settings exported to C:/)).toBeVisible();
    });
  });

  it("says nothing when the person cancels the export", async () => {
    startApp({ exportedTo: null });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Export settings" }));

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/^Settings exported/)).toBeNull();
  });

  it("imports settings and shows them at once", async () => {
    startApp({
      imported: settingsWith({ advanced: { developerMode: true } }),
    });
    const user = userEvent.setup();
    renderTab();
    const toggle = await screen.findByRole("switch", { name: "Developer mode" });
    expect(toggle).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Import settings" }));

    await screen.findByText("Settings imported");
    await waitFor(() => {
      expect(screen.getByText("Settings imported")).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Developer mode" })).toBeChecked();
    });
  });

  it("shows the error code when the file cannot be imported, and changes nothing", async () => {
    startApp({ failImport: true });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Import settings" }));

    await screen.findByText("Something went wrong (ARD-SET-003)");
    await waitFor(() => {
      expect(screen.getByText("Something went wrong (ARD-SET-003)")).toBeVisible();
    });
    expect(screen.getByRole("switch", { name: "Developer mode" })).not.toBeChecked();
  });
});

describe("Advanced → Diagnostics", () => {
  it("records normal detail by default, and saves the level that is chosen", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    expect(await screen.findByRole("radio", { name: "Normal" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Everything (debug)" }));

    await waitFor(() => {
      expect(asked(calls, "change_setting").map((call) => call.payload)).toEqual([
        { change: { advancedLogLevel: "debug" } },
      ]);
    });
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Everything (debug)" })).toBeChecked();
    });
  });

  it("opens the log viewer, and the logs folder", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "View logs" }));
    await user.click(screen.getByRole("button", { name: "Open logs folder" }));

    expect(onViewLogs).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(asked(calls, "open_logs_folder")).toHaveLength(1);
    });
  });

  it("says where the diagnostics were saved", async () => {
    startApp({ diagnosticsTo: "C:\\Users\\Ada\\arden-diagnostics.zip" });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Export diagnostics" }));

    await waitFor(() => {
      expect(screen.getByText(/^Diagnostics exported to C:/)).toBeVisible();
    });
  });

  it("says nothing when the person cancels the export", async () => {
    const calls = startApp({ diagnosticsTo: null });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Export diagnostics" }));

    await waitFor(() => {
      expect(asked(calls, "export_diagnostics")).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/^Diagnostics exported/)).toBeNull();
  });
});

describe("Advanced → resetting", () => {
  it("asks before resetting the settings, with Cancel in front, and does nothing on Cancel", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Reset settings" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Reset all settings?" });
    await animationsDone(dialog);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(asked(calls, "reset_settings")).toEqual([]);
  });

  it("resets every setting once it is confirmed", async () => {
    const calls = startApp({ settings: settingsWith({ advanced: { developerMode: true } }) });
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Developer mode" })).toBeChecked();
    });
    await user.click(screen.getByRole("button", { name: "Reset settings" }));

    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Reset settings",
      }),
    );

    await waitFor(() => {
      expect(asked(calls, "reset_settings")).toHaveLength(1);
    });
    await screen.findByText("Settings reset");
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Developer mode" })).not.toBeChecked();
    });
  });

  it("asks before wiping Arden Code, and wipes only when told to", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reset Arden Code" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Reset Arden Code?" });
    await animationsDone(dialog);
    expect(asked(calls, "reset_app")).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Reset Arden Code" }));

    await waitFor(() => {
      expect(asked(calls, "reset_app")).toHaveLength(1);
    });
  });

  it("closes the question with Esc, and does nothing", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reset Arden Code" }));
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(asked(calls, "reset_app")).toEqual([]);
  });
});

describe("Advanced", () => {
  it("has no accessibility violations, also with a question open", async () => {
    startApp();
    const user = userEvent.setup();
    const { container } = renderTab();
    await screen.findByRole("switch", { name: "Developer mode" });
    await expectNoAccessibilityViolations(container);

    await user.click(screen.getByRole("button", { name: "Reset Arden Code" }));
    const dialog = await screen.findByRole("alertdialog");
    await animationsDone(dialog);

    await expectNoAccessibilityViolations(document.body);
  });
});
