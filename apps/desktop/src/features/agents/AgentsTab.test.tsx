import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/Toaster";
import type { Detection } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { AgentsTab } from "./AgentsTab";

import "@/styles/global.css";

const claude: Detection = {
  cli: "claude",
  installed: true,
  path: String.raw`C:\Users\Ada\.local\bin\claude.exe`,
  version: "2.1.5",
  installUrl: "https://code.claude.com/docs/en/setup",
};

const codex: Detection = {
  cli: "codex",
  installed: false,
  path: null,
  version: null,
  installUrl: "https://github.com/openai/codex",
};

function startApp(detections: Detection[] | "fail" = [claude, codex]) {
  Object.assign(globalThis, { isTauri: true });
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "detect_agents") {
        if (detections === "fail") {
          throw JSON.stringify({
            code: "ARD-PROC-001",
            messageKey: "errors.ARD-PROC-001",
            details: null,
          });
        }
        return detections;
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
      <AgentsTab />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

const section = (name: string) => screen.getByRole("region", { name });

describe("Settings → Agents", () => {
  it("says that it only looks", async () => {
    startApp();
    renderTab();

    expect(await screen.findByText(/never installs them, updates them or signs in/)).toBeVisible();
  });

  it("shows an installed agent with its version and where it is", async () => {
    startApp();
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("Installed")).toBeVisible();
    expect(within(agent).getByText("2.1.5")).toBeVisible();
    expect(within(agent).getByText(String.raw`C:\Users\Ada\.local\bin\claude.exe`)).toBeVisible();
  });

  it("says when the version could not be read", async () => {
    startApp([{ ...claude, version: null }, codex]);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("Installed")).toBeVisible();
    expect(within(agent).getByText("Unknown")).toBeVisible();
  });

  it("says when an agent is not installed, and shows no path or version for it", async () => {
    startApp();
    renderTab();

    await screen.findByRole("region", { name: "Codex" });
    const agent = section("Codex");

    expect(within(agent).getByText("Not installed")).toBeVisible();
    expect(
      within(agent).getByText("Codex was not found. Install it, then check again."),
    ).toBeVisible();
    expect(within(agent).queryByText("Version")).toBeNull();
    expect(within(agent).queryByText("Location")).toBeNull();
  });

  it("offers a way to install each agent, which opens its page in the browser", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("region", { name: "Codex" });

    await user.click(screen.getByRole("button", { name: "How to install Codex" }));

    await waitFor(() => {
      const opened = calls.filter((call) => call.command === "open_link");
      expect(opened).toHaveLength(1);
      expect(
        z.object({ url: z.string(), confirmed: z.boolean() }).parse(opened[0]?.payload),
      ).toEqual({ url: "https://github.com/openai/codex", confirmed: false });
    });
  });

  it("looks again when asked, since the person may have installed something", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("region", { name: "Codex" });

    await user.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(calls.filter((call) => call.command === "detect_agents")).toHaveLength(2);
    });
  });

  it("shows the error code when agents cannot be looked for", async () => {
    startApp("fail");
    renderTab();

    expect(await screen.findByText(/ARD-PROC-001/)).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    startApp();
    const { container } = renderTab();
    await screen.findByRole("region", { name: "Claude Code" });

    await expectNoAccessibilityViolations(container);
  });
});
