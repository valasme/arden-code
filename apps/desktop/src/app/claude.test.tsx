import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Session } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entry = "/") {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

/** A Claude session that has had one message, answered. */
function answeredClaudeSession(): Session {
  return {
    ...sessionNamed("session-1", "Fix the build", "playground", "claude"),
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

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Choosing the agent of a session (ADR 0039)", () => {
  it("offers the agent of an empty session in the message box, and choosing Claude makes it a Claude session", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [sessionNamed("session-1", null)] });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Agent: Demo agent" }));
    await animationsDone(await screen.findByRole("menu"));
    await user.click(screen.getByRole("menuitemradio", { name: "Claude" }));

    expect(rust.callsTo("set_session_agent")).toEqual([{ id: "session-1", agent: "claude" }]);
    expect(await screen.findByRole("button", { name: "Agent: Claude" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Message Claude",
    );
    // The badge beside the session's title names the agent too.
    const title = screen.getByRole("heading", { level: 1, name: "New session" });
    expect(title.parentElement).toHaveTextContent("Claude");
  });

  it("names the agent of a session that has had a message in plain text, under its reply too", async () => {
    startSessionsRust({ sessions: [answeredClaudeSession()] });
    renderApp("/session/session-1");

    expect(await screen.findByText("Claude · Playground")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Agent:/u })).toBeNull();
    const feed = screen.getByRole("feed", { name: "Messages" });
    expect(within(feed).getByRole("heading", { level: 3, name: "Claude" })).toBeVisible();
  });

  it("says Claude is replying, in the turn and in the status bar", async () => {
    const user = userEvent.setup();
    startSessionsRust({ sessions: [sessionNamed("session-1", null, "playground", "claude")] });
    renderApp("/session/session-1");

    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Fix the build{Enter}",
    );

    expect(await screen.findByText("Claude is replying…")).toBeVisible();
    const statusBar = screen.getByRole("contentinfo");
    expect(within(statusBar).getByText("Claude: replying")).toBeVisible();
  });

  it("has no accessibility violations with the agent menu in the message box", async () => {
    startSessionsRust({ sessions: [sessionNamed("session-1", null)] });
    renderApp("/session/session-1");

    await screen.findByRole("button", { name: "Agent: Demo agent" });
    await expectNoAccessibilityViolations(document.body);
  });
});

describe("The welcome state (ADR 0039)", () => {
  it("asks what the agent a new session takes should work on, and starts the session with it", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ newSessionAgent: "claude" });
    renderApp();

    expect(
      await screen.findByRole("heading", { level: 1, name: "What should Claude work on?" }),
    ).toBeVisible();
    expect(screen.getByText("Claude · Playground")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toEqual([{ agent: "claude" }]);
    });
  });
});

describe("An error Arden Code knows (ADR 0039)", () => {
  it("says what happened, what to do and its code", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Hello{Enter}");
    await screen.findByText("Claude is replying…");

    rust.emit({
      type: "itemAdded",
      turnId: "turn-1",
      item: {
        type: "error",
        id: "turn-1-error",
        message: "Not logged in · Please run /login",
        code: "ARD-AGT-009",
      },
    });
    rust.emit({ type: "failed", turnId: "turn-1" });

    expect(await screen.findByText("Claude Code is not signed in.")).toBeVisible();
    expect(
      screen.getByText(
        "Open a terminal, run claude, sign in with /login, then send your message again.",
      ),
    ).toBeVisible();
    expect(screen.getByText("ARD-AGT-009")).toBeVisible();
  });

  it("shows Claude Code's own reason when Claude could not answer", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Hello{Enter}");
    await screen.findByText("Claude is replying…");

    rust.emit({
      type: "itemAdded",
      turnId: "turn-1",
      item: {
        type: "error",
        id: "turn-1-error",
        message: "API Error: Overloaded",
        code: "ARD-AGT-013",
      },
    });
    rust.emit({ type: "failed", turnId: "turn-1" });

    expect(await screen.findByText("Claude could not answer.")).toBeVisible();
    expect(screen.getByText("API Error: Overloaded")).toBeVisible();
  });
});
