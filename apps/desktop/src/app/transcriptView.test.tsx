import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Session } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

/** A session whose one reply is the agent's thinking. */
function thinkingSession(id: string, title: string): Session {
  return {
    ...sessionNamed(id, title, "playground", "claude"),
    turns: [
      {
        id: `${id}-turn`,
        prompt: title,
        startedAt: "2026-09-30T14:05:10Z",
        status: "done",
        items: [{ type: "thinking", id: `${id}-thinking`, text: `Reasoning in ${title}` }],
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

describe("A session's transcript view (ADR 0051)", () => {
  it("is the default view from the settings", async () => {
    startSessionsRust({ sessions: [thinkingSession("s1", "First")], transcriptView: "thinking" });
    render(<App history={createMemoryHistory({ initialEntries: ["/session/s1"] })} />);

    expect(await screen.findByText("Reasoning in First")).toBeVisible();
  });

  it("changes from the session's menu, for that session only", async () => {
    startSessionsRust({
      sessions: [thinkingSession("s1", "First"), thinkingSession("s2", "Second")],
    });
    const user = userEvent.setup();
    const history = createMemoryHistory({ initialEntries: ["/session/s1"] });
    render(<App history={history} />);
    expect(await screen.findByText("Reasoning in First")).not.toBeVisible();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Transcript view" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Thinking" }));

    await waitFor(() => {
      expect(screen.getByText("Reasoning in First")).toBeVisible();
    });
    history.push("/session/s2");
    expect(await screen.findByText("Reasoning in Second")).not.toBeVisible();
    history.push("/session/s1");
    expect(await screen.findByText("Reasoning in First")).toBeVisible();
  });
});
