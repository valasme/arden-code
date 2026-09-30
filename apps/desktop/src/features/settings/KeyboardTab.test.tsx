import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import { commandDefinitions } from "@/features/commands/registry";
import type { Settings } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { KeyboardTab } from "./KeyboardTab";

import "@/styles/global.css";

const setCall = z.object({ command: z.string(), shortcuts: z.array(z.string()) });
const resetCall = z.object({ command: z.string().nullable() });

interface Call {
  command: string;
  payload: unknown;
}

/** Rust as a test double: it keeps the shortcuts a person set, like the real settings service. */
function startApp(shortcuts: Record<string, string[]> = {}) {
  Object.assign(globalThis, { isTauri: true });
  let settings: Settings = settingsWith({ keyboard: { shortcuts } });
  const calls: Call[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "get_settings") return settings;
      if (command === "set_shortcuts") {
        const { command: id, shortcuts: next } = setCall.parse(payload);
        settings = settingsWith({
          keyboard: { shortcuts: { ...settings.keyboard.shortcuts, [id]: next } },
        });
        return settings;
      }
      if (command === "reset_shortcuts") {
        const { command: id } = resetCall.parse(payload);
        const rest = Object.fromEntries(
          Object.entries(settings.keyboard.shortcuts).filter(([key]) => id !== null && key !== id),
        );
        settings = settingsWith({ keyboard: { shortcuts: id === null ? {} : rest } });
        return settings;
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
      <KeyboardTab />
      <Toaster />
    </QueryClientProvider>,
  );
}

const changesOf = (calls: Call[], command: string) =>
  calls.filter((call) => call.command === command).map((call) => call.payload);

const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(`^${name}`) });

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Settings → Keyboard", () => {
  it("lists every command with its shortcuts", async () => {
    startApp();
    renderTab();

    await screen.findByRole("row", { name: /Command palette/ });

    expect(screen.getAllByRole("row")).toHaveLength(commandDefinitions.length + 1);
    expect(rowOf("Command palette")).toHaveTextContent("Ctrl+K");
    expect(rowOf("Command palette")).toHaveTextContent("Ctrl+Shift+P");
    expect(rowOf("Toggle sidebar")).toHaveTextContent("Ctrl+B");
    expect(rowOf("Back")).toHaveTextContent("Alt+←");
  });

  it("shows the shortcuts a person changed, and none for a command that was emptied", async () => {
    startApp({ "palette.open": ["Ctrl+Shift+O"], "sidebar.toggle": [] });
    renderTab();

    await waitFor(() => {
      expect(rowOf("Command palette")).toHaveTextContent("Ctrl+Shift+O");
    });
    expect(rowOf("Toggle sidebar")).toHaveTextContent("No shortcut");
  });

  it("can be searched by the name of a command or by a shortcut", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("row", { name: /Command palette/ });

    await user.type(screen.getByRole("searchbox", { name: "Search shortcuts" }), "sidebar");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(rowOf("Toggle sidebar")).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search shortcuts" }));
    await user.type(screen.getByRole("searchbox", { name: "Search shortcuts" }), "ctrl+j");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(rowOf("Toggle inspector")).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search shortcuts" }));
    await user.type(screen.getByRole("searchbox", { name: "Search shortcuts" }), "qqqq");
    expect(await screen.findByText("No command matches.")).toBeVisible();
  });

  it("records a new shortcut in place of the one that was clicked, and saves it", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+K for Command palette" }),
    );

    expect(screen.getByText("Press the new shortcut, or Esc to cancel.")).toBeVisible();
    await user.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");

    await waitFor(() => {
      expect(changesOf(calls, "set_shortcuts")).toEqual([
        { command: "palette.open", shortcuts: ["Ctrl+Shift+O", "Ctrl+Shift+P"] },
      ]);
    });
    expect(
      await screen.findByRole("button", { name: /^Change shortcut Ctrl\+Shift\+O for/ }),
    ).toBeVisible();
    expect(screen.queryByText("Press the new shortcut, or Esc to cancel.")).toBeNull();
  });

  it("adds a shortcut to a command", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Add a shortcut for Toggle sidebar" }),
    );

    await user.keyboard("{Control>}{Alt>}{/Alt}{/Control}");
    await user.keyboard("{Alt>}s{/Alt}");

    await waitFor(() => {
      expect(changesOf(calls, "set_shortcuts")).toEqual([
        { command: "sidebar.toggle", shortcuts: ["Ctrl+B", "Alt+S"] },
      ]);
    });
  });

  it("removes a shortcut", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(
      await screen.findByRole("button", {
        name: "Remove shortcut Ctrl+Shift+P from Command palette",
      }),
    );

    await waitFor(() => {
      expect(changesOf(calls, "set_shortcuts")).toEqual([
        { command: "palette.open", shortcuts: ["Ctrl+K"] },
      ]);
    });
  });

  it("stops recording on Esc and changes nothing", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+B for Toggle sidebar" }),
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Press the new shortcut, or Esc to cancel.")).toBeNull();
    expect(changesOf(calls, "set_shortcuts")).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Change shortcut Ctrl+B for Toggle sidebar" }),
    ).toHaveFocus();
  });

  it("does not run a command when its shortcut is pressed to record it", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    const pressed = vi.fn<(event: KeyboardEvent) => void>();
    window.addEventListener("keydown", pressed);
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+B for Toggle sidebar" }),
    );

    await user.keyboard("{Control>}b{/Control}");

    window.removeEventListener("keydown", pressed);
    expect(pressed).not.toHaveBeenCalled();
    expect(changesOf(calls, "set_shortcuts")).toEqual([]);
  });

  it.each([
    ["{Alt>}{F4}{/Alt}", "Windows keeps Alt+F4 for itself"],
    ["{Control>}c{/Control}", "Ctrl+C edits text in every text field"],
    [
      "{Control>}{Alt>}k{/Alt}{/Control}",
      "Many keyboards type characters with Ctrl and Alt together",
    ],
    ["k", "K would take over typing"],
  ])("refuses %s before saving, and keeps listening for another", async (keys, message) => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+B for Toggle sidebar" }),
    );

    await user.keyboard(keys);

    expect(await screen.findByText((text) => text.includes(message))).toBeVisible();
    expect(changesOf(calls, "set_shortcuts")).toEqual([]);
    await user.keyboard("{Control>}m{/Control}");
    await waitFor(() => {
      expect(changesOf(calls, "set_shortcuts")).toEqual([
        { command: "sidebar.toggle", shortcuts: ["Ctrl+M"] },
      ]);
    });
  });

  it("flags a shortcut another command has, and saves nothing until told to", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+K for Command palette" }),
    );

    await user.keyboard("{Control>}j{/Control}");

    expect(await screen.findByText("Ctrl+J is already used by Toggle inspector.")).toBeVisible();
    expect(changesOf(calls, "set_shortcuts")).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(changesOf(calls, "set_shortcuts")).toEqual([]);
    expect(screen.queryByText("Ctrl+J is already used by Toggle inspector.")).toBeNull();
    expect(rowOf("Toggle inspector")).toHaveTextContent("Ctrl+J");
  });

  it("moves the shortcut from the other command when told to use it here instead", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(
      await screen.findByRole("button", { name: "Change shortcut Ctrl+K for Command palette" }),
    );
    await user.keyboard("{Control>}j{/Control}");

    await user.click(await screen.findByRole("button", { name: "Use it here instead" }));

    await waitFor(() => {
      expect(changesOf(calls, "set_shortcuts")).toEqual([
        { command: "inspector.toggle", shortcuts: [] },
        { command: "palette.open", shortcuts: ["Ctrl+J", "Ctrl+Shift+P"] },
      ]);
    });
    await waitFor(() => {
      expect(rowOf("Toggle inspector")).toHaveTextContent("No shortcut");
    });
  });

  it("resets one command, and only that one", async () => {
    const calls = startApp({ "palette.open": ["Ctrl+Shift+O"], "sidebar.toggle": [] });
    const user = userEvent.setup();
    renderTab();

    await user.click(
      await screen.findByRole("button", { name: "Reset the shortcuts of Command palette" }),
    );

    await waitFor(() => {
      expect(changesOf(calls, "reset_shortcuts")).toEqual([{ command: "palette.open" }]);
    });
    await waitFor(() => {
      expect(rowOf("Command palette")).toHaveTextContent("Ctrl+K");
    });
    expect(rowOf("Toggle sidebar")).toHaveTextContent("No shortcut");
    expect(
      screen.queryByRole("button", { name: "Reset the shortcuts of Command palette" }),
    ).toBeNull();
  });

  it("resets every command at once, and offers it only when something was changed", async () => {
    const calls = startApp({ "palette.open": ["Ctrl+Shift+O"], "sidebar.toggle": [] });
    const user = userEvent.setup();
    renderTab();
    const resetAll = await screen.findByRole("button", { name: "Reset all shortcuts" });
    await waitFor(() => {
      expect(resetAll).toBeEnabled();
    });

    await user.click(resetAll);

    await waitFor(() => {
      expect(changesOf(calls, "reset_shortcuts")).toEqual([{ command: null }]);
    });
    await waitFor(() => {
      expect(rowOf("Toggle sidebar")).toHaveTextContent("Ctrl+B");
    });
    expect(screen.getByRole("button", { name: "Reset all shortcuts" })).toBeDisabled();
  });

  it("has no accessibility violations, also while a shortcut is being recorded", async () => {
    startApp({ "palette.open": ["Ctrl+Shift+O"] });
    const user = userEvent.setup();
    const { container } = renderTab();
    await screen.findByRole("button", { name: "Reset the shortcuts of Command palette" });
    await expectNoAccessibilityViolations(container);

    await user.click(
      screen.getByRole("button", { name: "Change shortcut Ctrl+B for Toggle sidebar" }),
    );
    await user.keyboard("{Control>}j{/Control}");
    await screen.findByText("Ctrl+J is already used by Toggle inspector.");

    await expectNoAccessibilityViolations(container);
    expect(within(container).getByRole("button", { name: "Use it here instead" })).toBeVisible();
  });
});
