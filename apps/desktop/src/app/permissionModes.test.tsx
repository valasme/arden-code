import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emit } from "@tauri-apps/api/event";
import { page } from "vitest/browser";

import type { AppError, Session } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone, menuClosed } from "@/test/animations";
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
  await menuClosed();
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Choosing the permission mode (ADR 0044)", () => {
  it("is offered after the effort in a Claude session, and saved when chosen", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");

    const mode = await screen.findByRole("button", { name: "Permission mode: Manual" });
    const effort = screen.getByRole("button", { name: /^Effort:/ });
    expect(effort.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await choose(user, "Permission mode: Manual", /^Accept edits/);

    expect(rust.callsTo("set_session_permission_mode")).toEqual([
      { id: "session-1", mode: "acceptEdits" },
    ]);
    expect(
      await screen.findByRole("button", { name: "Permission mode: Accept edits" }),
    ).toBeVisible();
  });

  it("can change while a reply runs", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Go on{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Model:/ })).toBeDisabled();
    });

    await choose(user, "Permission mode: Manual", /^Plan/);

    expect(rust.callsTo("set_session_permission_mode")).toEqual([
      { id: "session-1", mode: "plan" },
    ]);
    expect(await screen.findByRole("button", { name: "Permission mode: Plan" })).toBeVisible();
  });

  it("offers Bypass permissions once Settings allows it", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()], allowBypassPermissions: true });
    renderApp("/session/session-1");

    await choose(user, "Permission mode: Manual", /^Bypass permissions/);

    expect(rust.callsTo("set_session_permission_mode")).toEqual([
      { id: "session-1", mode: "bypassPermissions" },
    ]);
    expect(
      await screen.findByRole("button", { name: "Permission mode: Bypass permissions" }),
    ).toBeVisible();
  });

  it("moves to the next mode with Ctrl+Shift+M", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [{ ...answered(), permissionMode: "auto" }] });
    renderApp("/session/session-1");
    await screen.findByRole("button", { name: "Permission mode: Auto" });

    await user.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");

    expect(rust.callsTo("set_session_permission_mode")).toEqual([
      { id: "session-1", mode: "manual" },
    ]);
    expect(await screen.findByRole("button", { name: "Permission mode: Manual" })).toBeVisible();
  });

  it("has no next mode outside a Claude session", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered("demo")] });
    renderApp("/session/session-1");
    await screen.findByRole("heading", { level: 1, name: "Fix the build" });

    await user.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");

    expect(rust.callsTo("set_session_permission_mode")).toEqual([]);
  });

  it("is not offered for a Demo agent session", async () => {
    startSessionsRust({ sessions: [answered("demo")] });
    renderApp("/session/session-1");

    await screen.findByRole("heading", { level: 1, name: "Fix the build" });
    expect(screen.queryByRole("button", { name: /^Permission mode:/ })).toBeNull();
  });

  it("follows the mode Claude Code reports, such as Plan entered by Claude itself", async () => {
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");
    await screen.findByRole("button", { name: "Permission mode: Manual" });

    rust.followPermissionMode("session-1", "plan");
    await emit("session-changed", { sessionId: "session-1", permissionMode: "plan", notice: null });

    expect(await screen.findByRole("button", { name: "Permission mode: Plan" })).toBeVisible();
  });

  it("goes back to the mode Claude Code kept when it refused one, and says why", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answered()] });
    renderApp("/session/session-1");
    await choose(user, "Permission mode: Manual", /^Auto/);
    await screen.findByRole("button", { name: "Permission mode: Auto" });

    rust.followPermissionMode("session-1", "manual");
    const notice: AppError = {
      code: "ARD-AGT-018",
      messageKey: "errors.ARD-AGT-018",
      details: "Auto mode is not available for this account",
    };
    await emit("session-changed", { sessionId: "session-1", permissionMode: "manual", notice });

    expect(await screen.findByRole("button", { name: "Permission mode: Manual" })).toBeVisible();
    const told = await screen.findByText("Claude Code did not change the permission mode.");
    await waitFor(() => {
      expect(told).toBeVisible();
    });
  });

  it("starts the welcome screen in the mode a new session takes, and gives the one chosen before the first message", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ newSessionAgent: "claude", newSessionPermissionMode: "plan" });
    renderApp("/");

    await choose(user, "Permission mode: Plan", /^Accept edits/);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.callsTo("set_session_permission_mode")).toEqual([
      { id: expect.any(String), mode: "acceptEdits" },
    ]);
    const order = rust.calls.map((call) => call.command);
    expect(order.indexOf("set_session_permission_mode")).toBeLessThan(
      order.indexOf("send_message"),
    );
  });
});
