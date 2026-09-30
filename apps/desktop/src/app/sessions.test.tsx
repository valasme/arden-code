import { createMemoryHistory } from "@tanstack/react-router";
import type { Channel } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { z } from "zod";

import type { ProjectListing, Session, TurnEvent } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { App } from "./App";

import "@/styles/global.css";

const playground = {
  id: "playground",
  kind: "playground",
  name: "Playground",
  path: String.raw`C:\Users\Ada\AppData\Local\io.github.valasme.arden\playground`,
} as const;

/** Rust as a test double: the sessions in memory, and a way to stream a reply by hand. */
function startRust({
  emitBeforeAnswering = [],
  failCreate = false,
  regionalFormat = "windows",
}: {
  regionalFormat?: "windows" | "english";
  /** Events sent before the answer to send_message, as a fast reply can. */
  emitBeforeAnswering?: TurnEvent[];
  failCreate?: boolean;
} = {}) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  const sessions: Session[] = [];
  const calls: { command: string; payload: unknown }[] = [];
  let channel: Channel<TurnEvent> | undefined;

  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "get_settings") return settingsWith({ general: { regionalFormat } });
      if (command === "list_projects") {
        const listing: ProjectListing = {
          project: playground,
          sessions: sessions.toReversed().map(({ turns: _turns, ...summary }) => summary),
        };
        return [listing];
      }
      if (command === "create_session") {
        if (failCreate) {
          throw JSON.stringify({
            code: "ARD-AGT-001",
            messageKey: "errors.ARD-AGT-001",
            details: null,
          });
        }
        const session: Session = {
          id: `session-${sessions.length + 1}`,
          projectId: "playground",
          agent: "demo",
          title: null,
          createdAt: "2026-09-30T14:05:09Z",
          turns: [],
        };
        sessions.push(session);
        return structuredClone(session);
      }
      if (command === "get_session") {
        const { id } = z.object({ id: z.string() }).parse(payload);
        const found = sessions.find((session) => session.id === id);
        if (!found) {
          throw JSON.stringify({
            code: "ARD-AGT-001",
            messageKey: "errors.ARD-AGT-001",
            details: null,
          });
        }
        // A copy, as the one that crosses the IPC boundary is.
        return structuredClone(found);
      }
      if (command === "send_message") {
        const { sessionId, text, onEvent } = z
          .object({
            sessionId: z.string(),
            text: z.string(),
            onEvent: z.custom<Channel<TurnEvent>>(),
          })
          .parse(payload);
        const session = sessions.find((found) => found.id === sessionId);
        if (!session) throw new Error("no such session");
        channel = onEvent;
        session.title ??= text;
        session.turns.push({
          id: `turn-${session.turns.length + 1}`,
          prompt: text,
          startedAt: "2026-09-30T14:05:10Z",
          status: "running",
          items: [],
        });
        const answer = structuredClone(session);
        for (const event of emitBeforeAnswering) onEvent.onmessage(event);
        return answer;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return {
    calls,
    sent: () => calls.filter((call) => call.command === "send_message"),
    /** Streams an event of the reply, as Rust would through the channel. */
    emit(event: TurnEvent) {
      if (!channel) throw new Error("no message was sent yet");
      channel.onmessage(event);
    },
  };
}

function renderApp(entry = "/") {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

const delta = (text: string, turn = "turn-1"): TurnEvent => ({
  type: "textDelta",
  turnId: turn,
  itemId: `${turn}-text`,
  text,
});

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

const messageBox = () => screen.findByRole("textbox", { name: "Message" });
const sidebar = () => screen.getByRole("complementary", { name: "Sidebar" });

describe("With no session open", () => {
  it("shows the welcome state: the logo, one line and three shortcuts", async () => {
    startRust();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Real agents are coming. Try the Demo agent." }),
    ).toBeVisible();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("img", { name: "Arden Code" })).toBeVisible();
    const hints = within(within(main).getByRole("list")).getAllByRole("listitem");
    expect(hints.map((hint) => hint.textContent)).toEqual([
      "Ctrl+KCommand palette",
      "Ctrl+NNew session",
      "Ctrl+,Settings",
    ]);
  });

  it("lists the Playground in the sidebar, with no sessions yet", async () => {
    startRust();
    renderApp();

    const playgroundName = await screen.findByRole("heading", { name: "Playground" });
    expect(playgroundName).toBeVisible();
    expect(within(sidebar()).getByText("No sessions yet.")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    startRust();
    const { container } = render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    await screen.findByRole("heading", { name: "Real agents are coming. Try the Demo agent." });

    await expectNoAccessibilityViolations(container);
  });
});

describe("Starting a session", () => {
  it("starts a Demo agent session with Ctrl+N, lists it and lets you write in it at once", async () => {
    const rust = startRust();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}n{/Control}");

    const box = await messageBox();
    expect(box).toHaveFocus();
    expect(rust.calls.filter((call) => call.command === "create_session")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();
    expect(screen.getByText("Demo agent", { selector: "span" })).toBeVisible();
    const link = await within(sidebar()).findByRole("link", { name: "New session" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("starts one from the button in the sidebar too", async () => {
    startRust();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.click(within(sidebar()).getByRole("button", { name: "New session" }));

    expect(await messageBox()).toHaveFocus();
  });

  it("shows the error code when a session cannot be started", async () => {
    startRust({ failCreate: true });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}n{/Control}");

    await screen.findByText("Something went wrong (ARD-AGT-001)");
    await waitFor(() => {
      expect(screen.getByText("Something went wrong (ARD-AGT-001)")).toBeVisible();
    });
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });

  it("says so when a session does not exist any more, and offers a new one", async () => {
    startRust();
    renderApp("/session/session-99");

    const message = await screen.findByText("That session does not exist any more.");
    expect(message).toBeVisible();
    expect(
      within(screen.getByRole("main")).getByRole("button", { name: "New session" }),
    ).toBeVisible();
  });
});

async function openSession(rust: ReturnType<typeof startRust>) {
  const user = userEvent.setup();
  renderApp();
  await screen.findByRole("main");
  await user.keyboard("{Control>}n{/Control}");
  await messageBox();
  return { user, rust };
}

describe("Sending a message", () => {
  it("sends on Enter, streams the reply into the view and names the session after the message", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);

    await user.keyboard("Hello there{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ sessionId: "session-1", text: "Hello there" });
    expect(await screen.findByText("Hello there", { selector: "p" })).toBeVisible();
    expect(await messageBox()).toHaveValue("");

    rust.emit(delta("This is "));
    expect(await screen.findByText("This is")).toBeVisible();
    expect(screen.getByText("The Demo agent is replying…")).toBeVisible();
    rust.emit(delta("the reply."));
    expect(await screen.findByText("This is the reply.")).toBeVisible();

    rust.emit({ type: "finished", turnId: "turn-1" });
    await waitFor(() => {
      expect(screen.queryByText("The Demo agent is replying…")).toBeNull();
    });
    expect(screen.getByText("This is the reply.")).toBeVisible();
    // The title comes from the first message, in the header and in the sidebar.
    expect(screen.getByRole("heading", { level: 1, name: "Hello there" })).toBeVisible();
    expect(await within(sidebar()).findByRole("link", { name: "Hello there" })).toBeVisible();
  });

  it("does not lose the start of a reply that arrives before Rust has answered", async () => {
    const rust = startRust({ emitBeforeAnswering: [delta("Quick "), delta("reply.")] });
    const { user } = await openSession(rust);

    await user.keyboard("Hi{Enter}");

    expect(await screen.findByText("Quick reply.")).toBeVisible();
  });

  it("adds a line on Shift+Enter and sends nothing", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);

    await user.keyboard("first{Shift>}{Enter}{/Shift}second");

    expect(await messageBox()).toHaveValue("first\nsecond");
    expect(rust.sent()).toHaveLength(0);
  });

  it("does not send on the Enter that confirms a composed character", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);
    const box = await messageBox();
    await user.type(box, "こんにちは");

    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });

    expect(rust.sent()).toHaveLength(0);
    expect(box).toHaveValue("こんにちは");
  });

  it("sends nothing for an empty message, and nothing while the last reply is still coming", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);
    await user.keyboard("{Enter}");
    expect(rust.sent()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    await user.keyboard("one{Enter}");
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    await screen.findByText("The Demo agent is replying…");
    await user.keyboard("two{Enter}");

    expect(rust.sent()).toHaveLength(1);
    expect(await messageBox()).toHaveValue("two");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    rust.emit({ type: "finished", turnId: "turn-1" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    });
  });

  it("marks a reply that stopped", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");

    rust.emit({ type: "failed", turnId: "turn-1" });

    expect(await screen.findByText("The reply stopped.")).toBeVisible();
  });

  it("stores the time in UTC and shows it in local time", async () => {
    const rust = startRust({ regionalFormat: "english" });
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");

    const time = await screen.findByText(/2026/, { selector: "time" });

    expect(time).toHaveAttribute("datetime", "2026-09-30T14:05:10Z");
    // The same moment on the person's own clock, in the English (US) form, written out by hand.
    const local = new Date("2026-09-30T14:05:10Z");
    const hour = ((local.getHours() + 11) % 12) + 1;
    const minutes = String(local.getMinutes()).padStart(2, "0");
    const suffix = local.getHours() < 12 ? "AM" : "PM";
    expect(time.textContent).toBe(
      `${local.getMonth() + 1}/${local.getDate()}/${local.getFullYear()}, ${hour}:${minutes} ${suffix}`,
    );
  });

  it("has no accessibility violations with a conversation open", async () => {
    const rust = startRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");
    rust.emit(delta("A reply."));
    await screen.findByText("A reply.");

    await expectNoAccessibilityViolations(document.body);
  });
});
