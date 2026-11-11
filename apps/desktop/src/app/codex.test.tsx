import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Detection } from "@/ipc/bindings";
import { useDraftsStore } from "@/state/drafts";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import openaiLogo from "../../../../brand/reference/agents/chatgpt-logo.svg";
import { App } from "./App";

import "@/styles/global.css";

const installedCodex: Detection = {
  cli: "codex",
  installed: true,
  readiness: "ready",
  version: "0.167.1",
  path: "C:\\Programs\\Codex\\codex.exe",
  minimumVersion: null,
  tooOld: false,
  signedIn: true,
  installUrl: "https://github.com/openai/codex",
};

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
  useDraftsStore.setState(useDraftsStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

function renderApp(entry = "/") {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

describe("Codex sessions", () => {
  it.each(["welcome", "session"] as const)(
    "sends literal file-looking text without offering unverified mention syntax on %s",
    async (location) => {
      const user = userEvent.setup();
      const rust = startSessionsRust({
        detections: [installedCodex],
        sessions: [sessionNamed("session-1", null, "playground", "codex")],
      });
      useDraftsStore.getState().chooseOnWelcome({ agent: "codex" });
      renderApp(location === "welcome" ? "/" : "/session/session-1");
      await screen.findByRole("button", { name: "Agent: Codex" });
      await user.type(screen.getByRole("textbox", { name: "Message" }), "Read @README.md{Enter}");
      await waitFor(() => {
        expect(rust.callsTo("send_message")[0]).toMatchObject({ text: "Read @README.md" });
      });
      expect(rust.callsTo("find_files")).toEqual([]);
    },
  );

  it.each(["welcome", "session"] as const)(
    "does not carry a hidden Claude Ultrathink switch into a Codex message on %s",
    async (location) => {
      const user = userEvent.setup();
      const rust = startSessionsRust({
        detections: [installedCodex],
        sessions: [sessionNamed("session-1", null, "playground", "codex")],
      });
      const draft = location === "welcome" ? "welcome" : "session-1";
      useDraftsStore.getState().setUltrathink(draft, true);
      useDraftsStore.getState().chooseOnWelcome({ agent: "codex" });
      renderApp(location === "welcome" ? "/" : "/session/session-1");
      await screen.findByRole("button", { name: "Agent: Codex" });
      await user.type(screen.getByRole("textbox", { name: "Message" }), "Explain the build{Enter}");
      await waitFor(() => {
        expect(rust.callsTo("send_message")[0]).toMatchObject({ text: "Explain the build" });
      });
      expect(useDraftsStore.getState().ultrathink[draft]).toBe(true);
    },
  );

  it("offers the ready installation in an empty session and streams into its Codex transcript", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      detections: [installedCodex],
      sessions: [sessionNamed("session-1", null)],
    });
    renderApp("/session/session-1");
    await user.click(await screen.findByRole("button", { name: "Agent: Demo agent" }));
    await animationsDone(await screen.findByRole("menu"));
    await user.click(screen.getByRole("menuitemradio", { name: "Codex" }));
    const button = await screen.findByRole("button", { name: "Agent: Codex" });
    expect(button.querySelector("image")).toHaveAttribute("href", openaiLogo);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(rust.callsTo("set_session_agent")).toEqual([{ id: "session-1", agent: "codex" }]);
    expect(screen.getByLabelText("Codex sandbox: read-only")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Permission mode:/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Model:/u })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Explain the build{Enter}");
    expect(await screen.findByText("Codex is replying…")).toBeVisible();
    rust.emit({
      type: "textDelta",
      turnId: "turn-1",
      itemId: "codex-text",
      text: "Fixture streamed reply.",
    });
    expect(await screen.findByText("Fixture streamed reply.")).toBeVisible();
    rust.emit({ type: "finished", turnId: "turn-1" });
    expect(await screen.findByRole("heading", { level: 3, name: "Codex" })).toBeVisible();
  });

  it.each([
    ["signedOut", "Sign in required"],
    ["incompatible", "Not compatible"],
    ["unknown", "Not ready"],
    ["missing", "Not installed"],
  ] as const)(
    "lists an installation that is %s with the correct disabled reason",
    async (readiness, label) => {
      const user = userEvent.setup();
      startSessionsRust({ detections: [{ ...installedCodex, readiness }] });
      renderApp();
      await user.click(await screen.findByRole("button", { name: "Agent: Demo agent" }));
      const option = await screen.findByRole("menuitemradio", {
        name: new RegExp(`Codex.*${label}`, "u"),
      });
      expect(option).toHaveAttribute("aria-disabled", "true");
    },
  );

  it("asks to trust a folder before sending a Codex message", async () => {
    const user = userEvent.setup();
    const folder = folderProject("project-1", "untrusted-project");
    const rust = startSessionsRust({
      detections: [installedCodex],
      folders: [folder],
      sessions: [sessionNamed("session-1", null, folder.id, "codex")],
    });
    renderApp("/session/session-1");
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Explain it{Enter}");
    const dialog = await screen.findByRole("alertdialog", { name: "Trust “untrusted-project”?" });
    await waitFor(() => expect(within(dialog).getByText(/Codex/u)).toBeVisible());
    expect(rust.callsTo("send_message")).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("textbox", { name: "Message" })).toHaveValue("Explain it");
  });
});
