import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Entry } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { LogViewer } from "./LogViewer";

import "@/styles/global.css";

const entry = (over: Partial<Entry>): Entry => ({
  timestamp: "2026-09-30T14:05:09.123Z",
  level: "info",
  source: "arden_desktop::window",
  message: "window created",
  code: null,
  ...over,
});

const entries: Entry[] = [
  entry({
    level: "error",
    source: "arden_settings::store",
    message: "save failed",
    code: "ARD-SET-001",
  }),
  entry({ level: "warn", source: "arden_desktop::webview", message: "web engine stopped" }),
  entry({ level: "info", message: "window created" }),
  entry({ level: "debug", source: "arden_settings::service", message: "settings changed" }),
];

function startApp(read: () => Entry[] = () => entries) {
  Object.assign(globalThis, { isTauri: true });
  const calls: string[] = [];
  mockIPC(
    (command) => {
      calls.push(command);
      if (command === "read_logs") return read();
      if (command === "get_settings") return settingsWith();
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderViewer() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LogViewer />
    </QueryClientProvider>,
  );
}

const rows = () => screen.getAllByRole("row").slice(1);

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The log viewer", () => {
  it("lists the entries, with their level, source and error code", async () => {
    startApp();
    renderViewer();

    await screen.findByRole("table");
    expect(rows()).toHaveLength(4);
    const first = within(screen.getAllByRole("row")[1] ?? document.body);
    expect(first.getByText("Error")).toBeVisible();
    expect(first.getByText("arden_settings::store")).toBeVisible();
    expect(first.getByText(/save failed/)).toBeVisible();
    expect(first.getByText("(ARD-SET-001)")).toBeVisible();
    expect(screen.getByText("Showing 4 of 4 entries.")).toBeVisible();
  });

  it("says so when there are no entries at all", async () => {
    startApp(() => []);
    renderViewer();

    expect(await screen.findByText("There are no log entries yet.")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("filters by level, showing that level and the more serious ones", async () => {
    startApp();
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Level"), "warn");

    expect(await screen.findByText("Showing 2 of 2 entries.")).toBeVisible();
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText("window created")).toBeNull();
  });

  it("filters by source", async () => {
    startApp();
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Source"), "arden_settings::service");

    expect(rows()).toHaveLength(1);
    expect(screen.getByText("settings changed")).toBeVisible();
  });

  it("filters by the words typed, and says when nothing matches", async () => {
    startApp();
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole("table");

    await user.type(screen.getByLabelText("Search the messages"), "web engine");
    expect(rows()).toHaveLength(1);

    await user.type(screen.getByLabelText("Search the messages"), " zzz");
    expect(await screen.findByText("No entry matches.")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reads the files again on Refresh", async () => {
    let current = entries.slice(0, 1);
    const calls = startApp(() => current);
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole("table");
    expect(rows()).toHaveLength(1);

    current = entries;
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
    expect(calls.filter((command) => command === "read_logs").length).toBeGreaterThanOrEqual(2);
  });

  it("shows more entries a page at a time", async () => {
    const many = Array.from({ length: 450 }, (_, index) => entry({ message: `line ${index}` }));
    startApp(() => many);
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole("table");
    expect(rows()).toHaveLength(200);
    expect(screen.getByText("Showing 200 of 450 entries.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(rows()).toHaveLength(400);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(rows()).toHaveLength(450);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("opens the logs folder", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderViewer();

    await user.click(await screen.findByRole("button", { name: "Open logs folder" }));

    await waitFor(() => {
      expect(calls).toContain("open_logs_folder");
    });
  });

  it("has no accessibility violations", async () => {
    startApp();
    const { container } = renderViewer();
    await screen.findByRole("table");

    await expectNoAccessibilityViolations(container);
  });
});
