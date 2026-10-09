import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { UpdateStatus, UsageLimits, UsageWindow } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { useRepliesStore } from "@/state/replies";
import { settingsWith } from "@/test/settings";

import { StatusBar } from "./StatusBar";

import "@/styles/global.css";

const unknown: UsageLimits = { report: "unknown", windows: [] };

function startApp(status: UpdateStatus, usage: UsageLimits = unknown) {
  Object.assign(globalThis, { isTauri: true });
  const calls: string[] = [];
  mockIPC(
    (command) => {
      calls.push(command);
      if (command === "app_info") {
        return { name: "Arden Code", version: "0.1.0", commit: "x", buildDate: "x" };
      }
      if (command === "get_settings") return settingsWith();
      if (command === "get_update_status") return status;
      if (command === "usage_limits") return usage;
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderBar() {
  const root = createRootRoute({ component: () => <StatusBar /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The status bar and updates", () => {
  it("says nothing about updates when there is nothing to say", async () => {
    startApp({ state: "idle" });
    renderBar();

    expect(await screen.findByText("Version 0.1.0")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Update ready/ })).toBeNull();
    expect(screen.queryByText(/Downloading an update/)).toBeNull();
  });

  it("says an update is downloading, quietly", async () => {
    startApp({ state: "downloading", version: "2.0.0" });
    renderBar();

    expect(await screen.findByText("Downloading an update…")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Update ready/ })).toBeNull();
  });

  it("offers a restart when an update is ready, and asks Rust to install it on a click", async () => {
    const calls = startApp({ state: "ready", version: "2.0.0" });
    const user = userEvent.setup();
    renderBar();

    await user.click(await screen.findByRole("button", { name: "Update ready: restart" }));

    await waitFor(() => {
      expect(calls).toContain("restart_to_update");
    });
  });

  it("has no accessibility violations with an update ready", async () => {
    startApp({ state: "ready", version: "2.0.0" });
    const { container } = renderBar();
    await screen.findByRole("button", { name: "Update ready: restart" });

    await expectNoAccessibilityViolations(container);
  });
});

describe("The status bar and the layout", () => {
  it("says only status: the toggles for the regions are in the title bar", async () => {
    startApp({ state: "idle" });
    renderBar();

    await screen.findByText("Version 0.1.0");
    expect(screen.queryByRole("button", { name: /sidebar|inspector/i })).toBeNull();
  });
});

describe("The status bar and the open session", () => {
  afterEach(() => {
    useRepliesStore.setState(useRepliesStore.getInitialState());
  });

  it("says when the open session's agent is replying, without speaking it to screen readers", async () => {
    startApp({ state: "idle" });
    useRepliesStore.setState({ sessionId: "session-1", busy: true });
    renderBar();

    const replying = await screen.findByText("Demo agent: replying");
    expect(replying).toBeVisible();
    // The reply announcer speaks for the reply (ADR 0027); the bar must not say it twice.
    expect(replying.closest("[aria-live], [role=status], output")).toBeNull();
  });

  it("says when the open session's agent waits for an answer", async () => {
    startApp({ state: "idle" });
    useRepliesStore.setState({ sessionId: "session-1", busy: true, waiting: true });
    renderBar();

    expect(await screen.findByText("Demo agent: waiting for your answer")).toBeVisible();
    expect(screen.queryByText("Demo agent: replying")).toBeNull();
  });

  it("says nothing about the agent when no reply is running", async () => {
    startApp({ state: "idle" });
    useRepliesStore.setState({ sessionId: "session-1", busy: false });
    renderBar();

    await screen.findByText("Version 0.1.0");
    expect(screen.queryByText("Demo agent: replying")).toBeNull();
  });
});

function window(overrides: Partial<UsageWindow> = {}): UsageWindow {
  return {
    kind: "fiveHour",
    percent: 42,
    resetsAt: "2099-10-09T15:10:00Z",
    status: "allowed",
    ...overrides,
  };
}

const plan: UsageLimits = {
  report: "reported",
  windows: [window(), window({ kind: "weekly", percent: 18, resetsAt: "2099-10-13T09:00:00Z" })],
};

describe("The status bar and the usage limits", () => {
  it("shows the 5-hour and weekly limits Claude Code reports", async () => {
    startApp({ state: "idle" }, plan);
    renderBar();

    expect(await screen.findByText("5-hour 42%")).toBeVisible();
    expect(screen.getByText("Weekly 18%")).toBeVisible();
  });

  it("shows nothing when Claude Code reports no usage limits", async () => {
    startApp({ state: "idle" }, { report: "notForThisSignIn", windows: [] });
    renderBar();

    await screen.findByText("Version 0.1.0");
    expect(screen.queryByText(/5-hour/u)).toBeNull();
    expect(screen.queryByText(/Weekly/u)).toBeNull();
  });

  it("emphasizes a window from 80%", async () => {
    startApp({ state: "idle" }, { report: "reported", windows: [window({ percent: 86 })] });
    renderBar();

    const figure = await screen.findByText("5-hour 86%");

    expect(figure).toHaveAttribute("data-level", "near");
    expect(figure).toHaveClass("text-foreground");
  });

  it("says when a window at its limit resets", async () => {
    startApp(
      { state: "idle" },
      { report: "reported", windows: [window({ percent: 100, status: "rejected" })] },
    );
    renderBar();

    expect(await screen.findByText(/^5-hour limit reached, resets /u)).toBeVisible();
  });

  it("has no accessibility violations while it shows them", async () => {
    startApp({ state: "idle" }, plan);
    const { container } = renderBar();
    await screen.findByText("5-hour 42%");

    await expectNoAccessibilityViolations(container);
  });
});
