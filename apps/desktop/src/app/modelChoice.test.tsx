import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Catalog, Session } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entry: string) {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

function answered(agent: "claude" | "demo" = "claude"): Session {
  return {
    ...sessionNamed("session-1", "Fix the build", "playground", agent),
    turns: [
      {
        id: "turn-1",
        prompt: "Fix the build",
        startedAt: "2026-10-03T09:00:00Z",
        status: "done",
        items: [{ type: "text", id: "turn-1-text", text: "Fixed." }],
      },
    ],
  };
}

async function choose(user: ReturnType<typeof userEvent.setup>, button: string, item: RegExp) {
  await user.click(await screen.findByRole("button", { name: button }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  await user.click(within(menu).getByRole("menuitemradio", { name: item }));
  await screen.findByRole("main");
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Choosing the effort (ADR 0041)", () => {
  it("is offered beside the model for Claude, saved when chosen, and waits while a reply runs", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");

    await choose(user, "Effort: Default", /^High/);

    expect(rust.callsTo("set_session_effort")).toEqual([{ id: "session-1", effort: "high" }]);
    expect(await screen.findByRole("button", { name: "Effort: High" })).toBeVisible();
  });

  it("is not offered for a Demo agent session", async () => {
    startSessionsRust({ sessions: [sessionNamed("session-1", null)] });
    renderApp("/session/session-1");

    await screen.findByRole("button", { name: "Agent: Demo agent" });
    expect(screen.queryByRole("button", { name: /^Effort:/ })).toBeNull();
  });

  it("is chosen on the welcome screen too, and given to the session before its first message", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ newSessionAgent: "claude", newSessionEffort: "low" });
    renderApp("/");

    await choose(user, "Effort: Low", /^Max/);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.callsTo("set_session_effort")).toEqual([{ id: expect.any(String), effort: "max" }]);
    expect(rust.callsTo("set_session_model")).toEqual([]);
  });
});

describe("Choosing the model (ADR 0041)", () => {
  it("is offered for a Claude session, also after its first message, and not for the Demo agent", async () => {
    startSessionsRust({ sessions: [answered("claude"), { ...answered("demo"), id: "session-2" }] });
    renderApp("/session/session-1");

    expect(await screen.findByRole("button", { name: "Model: Default" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Agent:/ })).toBeNull();
  });

  it("is not offered for a Demo agent session", async () => {
    startSessionsRust({ sessions: [sessionNamed("session-1", null)] });
    renderApp("/session/session-1");

    await screen.findByRole("button", { name: "Agent: Demo agent" });
    expect(screen.queryByRole("button", { name: /^Model:/ })).toBeNull();
  });

  it("saves the model chosen, which the menu then shows", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");

    await choose(user, "Model: Default", /^Opus/);

    expect(rust.callsTo("set_session_model")).toEqual([{ id: "session-1", model: "opus" }]);
    expect(await screen.findByRole("button", { name: "Model: Opus" })).toBeVisible();
  });

  it("waits while a reply runs", async () => {
    const user = userEvent.setup();
    startSessionsRust({ sessions: [sessionNamed("session-1", null, "playground", "claude")] });
    renderApp("/session/session-1");

    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Model: Default" })).toBeDisabled();
    });
  });

  it("is chosen on the welcome screen too, and given to the session before its first message", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ newSessionAgent: "claude", newSessionModel: "opus" });
    renderApp("/");

    await choose(user, "Model: Opus", /^Sonnet/);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    const [created] = rust.callsTo("create_session");
    expect(created).toEqual({ agent: "claude", projectId: "playground" });
    expect(rust.callsTo("set_session_model")).toEqual([
      { id: expect.any(String), model: "sonnet" },
    ]);
    const order = rust.calls.map((call) => call.command);
    expect(order.indexOf("set_session_model")).toBeLessThan(order.indexOf("send_message"));
  });
});

const catalog: Catalog = {
  commands: [],
  terminalCommands: [],
  models: [
    {
      value: "default",
      displayName: "Default (recommended)",
      description: "Sonnet 5.5",
      resolvedModel: "claude-sonnet-5-5",
      efforts: ["low", "medium", "high", "extraHigh", "max"],
    },
    {
      value: "opus",
      displayName: "Opus 5.5",
      description: "For complex work",
      resolvedModel: "claude-opus-5-5",
      efforts: ["low", "medium", "high", "extraHigh", "max"],
    },
    {
      value: "haiku",
      displayName: "Haiku 4.5",
      description: "Fastest for quick answers",
      resolvedModel: null,
      efforts: [],
    },
    {
      value: "claude-opus-4-6",
      displayName: "Opus 4.6",
      description: "Best for everyday, complex tasks",
      resolvedModel: null,
      efforts: ["low", "medium", "high", "max"],
    },
  ],
};

describe("Choosing any model Claude Code lists (ADR 0042)", () => {
  it("lists the models Claude Code says it has, the older ones under a heading", async () => {
    const user = userEvent.setup();
    startSessionsRust({ sessions: [answered()], catalog });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Model: Default" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);

    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.querySelector("[data-name]")?.textContent),
    ).toEqual(["Default", "Opus 5.5", "Haiku 4.5", "Opus 4.6"]);
    expect(within(menu).getByText("Older models")).toBeVisible();
    expect(within(menu).getByRole("menuitemradio", { name: /Opus 5\.5/ })).toHaveTextContent(
      "For complex work",
    );
  });

  it("keeps the full id of an older model as the session's model", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()], catalog });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Model: Default" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Opus 4\.6/ }));

    expect(rust.callsTo("set_session_model")).toEqual([
      { id: "session-1", model: "claude-opus-4-6" },
    ]);
    expect(await screen.findByRole("button", { name: "Model: Opus 4.6" })).toBeVisible();
  });

  it("offers the efforts of the chosen model only, and none of them for a model with no effort", async () => {
    const user = userEvent.setup();
    startSessionsRust({
      sessions: [{ ...answered(), model: "claude-opus-4-6" }],
      catalog,
    });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Effort: Default" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);

    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.querySelector("[data-name]")?.textContent),
    ).toEqual(["Default", "Low", "Medium", "High", "Max"]);
  });

  it("shows a saved model that Claude Code no longer lists, as it is, and marks it", async () => {
    const user = userEvent.setup();
    startSessionsRust({ sessions: [{ ...answered(), model: "claude-opus-3" }], catalog });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Model: claude-opus-3" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);

    expect(within(menu).getByRole("menuitemradio", { name: /claude-opus-3/ })).toHaveTextContent(
      "Not in Claude Code's list",
    );
  });

  it("offers the four families until Claude Code has said its models", async () => {
    const user = userEvent.setup();
    startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Model: Default" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);

    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.querySelector("[data-name]")?.textContent),
    ).toEqual(["Default", "Fable", "Opus", "Sonnet", "Haiku"]);
  });
});
