import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/Toaster";
import type { Detection, UsageLimits } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { AgentsTab } from "./AgentsTab";

import "@/styles/global.css";

const claude: Detection = {
  cli: "claude",
  installed: true,
  path: String.raw`C:\Users\Ada\.local\bin\claude.exe`,
  version: "2.1.286",
  minimumVersion: "2.1.223",
  tooOld: false,
  signedIn: true,
  installUrl: "https://code.claude.com/docs/en/setup",
};

const codex: Detection = {
  cli: "codex",
  installed: false,
  path: null,
  version: null,
  minimumVersion: null,
  tooOld: false,
  signedIn: null,
  installUrl: "https://github.com/openai/codex",
};

const planLimits: UsageLimits = {
  report: "reported",
  windows: [
    { kind: "fiveHour", percent: 42, resetsAt: "2099-10-09T15:10:00Z", status: "allowed" },
    { kind: "weekly", percent: 18, resetsAt: "2099-10-13T09:00:00Z", status: "allowed" },
  ],
};

function startApp(
  detections: Detection[] | "fail" = [claude, codex],
  usage: UsageLimits = { report: "unknown", windows: [] },
  showUsageLimits = true,
) {
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
      if (command === "usage_limits") return usage;
      if (command === "get_settings") return settingsWith({ agents: { showUsageLimits } });
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
  it("says that it only looks, and nothing about an integration to come", async () => {
    startApp();
    renderTab();

    expect(await screen.findByText(/never installs them, updates them or signs in/)).toBeVisible();
    expect(screen.queryByText(/coming later/u)).toBeNull();
  });

  it("shows Claude Code signed in, with its version and the minimum", async () => {
    startApp();
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("2.1.286")).toBeVisible();
    expect(within(agent).getByText("2.1.223 or later")).toBeVisible();
    expect(within(agent).getByText("Signed in")).toBeVisible();
    expect(within(agent).queryByRole("alert")).toBeNull();
  });

  it("says how to sign in when Claude Code is signed out, without offering a sign-in of its own", async () => {
    startApp([{ ...claude, signedIn: false }, codex]);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("Not signed in")).toBeVisible();
    expect(
      within(agent).getByText("Open a terminal, run claude, and sign in with /login."),
    ).toBeVisible();
    expect(within(agent).queryByRole("button", { name: /sign in/iu })).toBeNull();
  });

  it("warns when Claude Code is older than the minimum, and says how to update it", async () => {
    startApp([{ ...claude, version: "2.1.100", tooOld: true }, codex]);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("2.1.100")).toBeVisible();
    expect(
      within(agent).getByText(
        "This version is too old for Arden Code. Run claude update in a terminal, then look again.",
      ),
    ).toBeVisible();
  });

  it("says when Claude Code is not installed", async () => {
    startApp([{ ...claude, installed: false, path: null, version: null, signedIn: null }, codex]);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("Not installed")).toBeVisible();
    expect(within(agent).queryByText("Signed in")).toBeNull();
    expect(within(agent).queryByText("Not signed in")).toBeNull();
  });

  it("shows an installed agent with its version and where it is", async () => {
    startApp();
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).getByText("Installed")).toBeVisible();
    expect(within(agent).getByText("2.1.286")).toBeVisible();
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
      within(agent).getByText("Codex was not found. Install it, then look again."),
    ).toBeVisible();
    expect(within(agent).queryByText("Version")).toBeNull();
    expect(within(agent).queryByText("Location")).toBeNull();
  });

  it("offers no install or update for an agent that is installed and new enough", async () => {
    startApp();
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).queryByRole("button")).toBeNull();
  });

  it("offers a way to update an agent that is too old, which opens its page", async () => {
    const calls = startApp([{ ...claude, version: "2.1.100", tooOld: true }, codex]);
    const user = userEvent.setup();
    renderTab();
    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).queryByRole("button", { name: /install/iu })).toBeNull();
    await user.click(within(agent).getByRole("button", { name: "How to update Claude Code" }));

    await waitFor(() => {
      const opened = calls.find((call) => call.command === "open_link");
      expect(z.object({ url: z.string(), confirmed: z.boolean() }).parse(opened?.payload)).toEqual({
        url: "https://code.claude.com/docs/en/setup",
        confirmed: false,
      });
    });
  });

  it("offers a way to install an agent that is not installed, which opens its page", async () => {
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

    await user.click(screen.getByRole("button", { name: "Look again" }));

    await waitFor(() => {
      expect(
        calls
          .filter((call) => call.command === "detect_agents")
          .map((call) => z.object({ fresh: z.boolean() }).parse(call.payload).fresh),
      ).toEqual([false, true]);
    });
  });

  it("shows the 5-hour and weekly limits Claude Code reports, with when they reset", async () => {
    startApp([claude, codex], planLimits);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(await within(agent).findByText("5-hour limit")).toBeVisible();
    expect(within(agent).getByText(/^42% · resets /u)).toBeVisible();
    expect(within(agent).getByText("Weekly limit")).toBeVisible();
    expect(within(agent).getByText(/^18% · resets /u)).toBeVisible();
  });

  it("says when Claude Code reports no usage limits for this sign-in", async () => {
    startApp([claude, codex], { report: "notForThisSignIn", windows: [] });
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(
      await within(agent).findByText("Claude Code reports no usage limits for this sign-in."),
    ).toBeVisible();
    expect(within(agent).queryByText("5-hour limit")).toBeNull();
  });

  it("says to update Claude Code when it cannot report usage limits", async () => {
    startApp([claude, codex], { report: "unsupported", windows: [] });
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(await within(agent).findByText("Update Claude Code to see usage limits.")).toBeVisible();
  });

  it("shows nothing about usage limits before Claude Code has reported them", async () => {
    startApp();
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });

    expect(within(agent).queryByText("Usage limits")).toBeNull();
    expect(within(agent).queryByText("5-hour limit")).toBeNull();
  });

  it("has a switch for the usage limits, on by default", async () => {
    startApp();
    renderTab();

    expect(await screen.findByRole("switch", { name: "Show usage limits" })).toBeChecked();
  });

  it("shows no usage limits when Show usage limits is off", async () => {
    startApp([claude, codex], planLimits, false);
    renderTab();

    const agent = await screen.findByRole("region", { name: "Claude Code" });
    expect(await screen.findByRole("switch", { name: "Show usage limits" })).not.toBeChecked();

    expect(within(agent).queryByText("5-hour limit")).toBeNull();
    expect(within(agent).queryByText("Weekly limit")).toBeNull();
  });

  it("asks Claude Code for the usage limits again on Look again", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("region", { name: "Codex" });

    await user.click(screen.getByRole("button", { name: "Look again" }));

    await waitFor(() => {
      const asked = calls.filter((call) => call.command === "refresh_usage_limits");
      expect(asked.map((call) => call.payload)).toEqual([{ onFocus: false }]);
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
