import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ContextWindow, UsageLimits, UsageWindow } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { Figures } from "./Figures";

import "@/styles/global.css";

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

function startApp(usage: UsageLimits, showUsageLimits = true) {
  Object.assign(globalThis, { isTauri: true });
  mockIPC(
    (command) => {
      if (command === "get_settings") return settingsWith({ agents: { showUsageLimits } });
      if (command === "usage_limits") return usage;
      return null;
    },
    { shouldMockEvents: true },
  );
}

function renderFigures(contextWindow: ContextWindow | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <p>Before</p>
      <Figures contextWindow={contextWindow} />
    </QueryClientProvider>,
  );
}

/** A window of 200,000 tokens, 13% full, which Claude Code compacts at 167,000. */
function window13(overrides: Partial<ContextWindow> = {}): ContextWindow {
  return {
    used: 26_000,
    size: 200_000,
    percent: 13,
    compactsAt: 167_000,
    parts: [
      { name: "System prompt", tokens: 2000, kind: "used" },
      { name: "Messages", tokens: 10_000, kind: "used" },
      { name: "System tools (deferred)", tokens: 20_000, kind: "deferred" },
      { name: "Autocompact buffer", tokens: 33_000, kind: "buffer" },
      { name: "Free space", tokens: 141_000, kind: "free" },
    ],
    ...overrides,
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Figures, with the usage limits", () => {
  it("shows the 5-hour and weekly limits Claude Code reports, in one button", async () => {
    startApp(plan);
    renderFigures();

    const button = await screen.findByRole("button", { name: "5-hour 42% Weekly 18%" });
    expect(button).toHaveTextContent("5-hour 42% · Weekly 18%");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("lists each limit with its reset time when pressed", async () => {
    startApp(plan);
    const user = userEvent.setup();
    renderFigures();

    await user.click(await screen.findByRole("button", { name: /5-hour 42%/u }));

    const details = await screen.findByRole("dialog", { name: "Usage limits" });
    await animationsDone(details);
    expect(within(details).getByText("5-hour limit")).toBeVisible();
    expect(within(details).getByText(/^42% used · resets /u)).toBeVisible();
    expect(within(details).getByText("Weekly limit")).toBeVisible();
    expect(within(details).getByText(/^18% used · resets /u)).toBeVisible();
  });

  it("opens and closes by keyboard, and gives the focus back", async () => {
    startApp(plan);
    const user = userEvent.setup();
    renderFigures();
    const button = await screen.findByRole("button", { name: /5-hour 42%/u });

    button.focus();
    await user.keyboard("{Enter}");
    const details = await screen.findByRole("dialog", { name: "Usage limits" });
    await animationsDone(details);
    expect(details).toBeVisible();
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(button).toHaveFocus();
  });

  it("shows nothing when Claude Code reports no usage limits", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    renderFigures();

    await screen.findByText("Before");
    // Give the figures every chance to arrive before saying there are none.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows nothing when Show usage limits is off", async () => {
    startApp(plan, false);
    renderFigures();

    await screen.findByText("Before");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("emphasizes a window from 80%", async () => {
    startApp({ report: "reported", windows: [window({ percent: 86 })] });
    renderFigures();

    const figure = await screen.findByText("5-hour 86%");

    expect(figure).toHaveAttribute("data-level", "near");
    expect(figure).toHaveClass("text-foreground");
  });

  it("says when a window at its limit resets", async () => {
    startApp({ report: "reported", windows: [window({ percent: 100, status: "rejected" })] });
    renderFigures();

    expect(await screen.findByText(/^5-hour limit reached, resets /u)).toBeVisible();
  });

  it("has no accessibility violations, closed or open", async () => {
    startApp(plan);
    const user = userEvent.setup();
    const { container } = renderFigures();
    await user.click(await screen.findByRole("button", { name: /5-hour 42%/u }));
    await animationsDone(await screen.findByRole("dialog", { name: "Usage limits" }));

    await expectNoAccessibilityViolations(container);
    await expectNoAccessibilityViolations(document.body);
  });
});

describe("Figures, with the context window (ADR 0044)", () => {
  it("starts with how full the context window is", async () => {
    startApp(plan);
    renderFigures(window13());

    expect(
      await screen.findByRole("button", { name: "Context 13% 5-hour 42% Weekly 18%" }),
    ).toHaveTextContent("Context 13% · 5-hour 42% · Weekly 18%");
  });

  it("shows the context window alone when there are no usage limits", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    renderFigures(window13());

    expect(await screen.findByRole("button", { name: "Context 13%" })).toBeVisible();
  });

  it("details the tokens used, where it is compacted, and what fills it", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    const user = userEvent.setup();
    renderFigures(window13());

    await user.click(await screen.findByRole("button", { name: "Context 13%" }));

    const details = await screen.findByRole("dialog", { name: "Context window" });
    await animationsDone(details);
    expect(within(details).getByText("13% used: 26K of 200K tokens")).toBeVisible();
    expect(within(details).getByText("Compacted at 84%")).toBeVisible();
    const parts = within(details)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(parts).toEqual(["System prompt", "Messages", "Autocompact buffer", "Free space"]);
    expect(within(details).getByText("141K")).toBeVisible();
  });

  it("says a window is not compacted on its own when it is not", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    const user = userEvent.setup();
    renderFigures(window13({ compactsAt: null }));

    await user.click(await screen.findByRole("button", { name: "Context 13%" }));

    await animationsDone(await screen.findByRole("dialog", { name: "Context window" }));
    expect(screen.getByText("Not compacted on its own")).toBeVisible();
  });

  it("emphasizes the context window from 80% of where it is compacted", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    renderFigures(window13({ used: 140_000, percent: 70 }));

    const figure = await screen.findByText("Context 70%");

    expect(figure).toHaveAttribute("data-level", "near");
    expect(figure).toHaveClass("text-foreground");
  });

  it("does not emphasize a window far from where it is compacted", async () => {
    startApp({ report: "notForThisSignIn", windows: [] });
    renderFigures(window13());

    expect(await screen.findByText("Context 13%")).toHaveAttribute("data-level", "normal");
  });
});
