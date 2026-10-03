import { createMemoryHistory } from "@tanstack/react-router";
import { emit } from "@tauri-apps/api/event";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Item, TurnEvent } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entry = "/") {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

const item = (value: Item): TurnEvent => ({ type: "itemAdded", turnId: "turn-1", item: value });

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
  it("shows the welcome state: the mark, a question, the Demo agent line, the message box and three shortcuts", async () => {
    startSessionsRust();
    renderApp();

    expect(
      await screen.findByRole("heading", { level: 1, name: "What should the Demo agent work on?" }),
    ).toBeVisible();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("img", { name: "Arden Code" })).toBeVisible();
    expect(within(main).getByText("Real agents are coming. Try the Demo agent.")).toBeVisible();
    expect(within(main).getByRole("textbox", { name: "Message" })).toHaveFocus();
    expect(within(main).getByText("Demo agent · Playground")).toBeVisible();
    const hints = within(within(main).getByRole("list")).getAllByRole("listitem");
    expect(hints.map((hint) => hint.textContent)).toEqual([
      "Ctrl+KCommand palette",
      "Ctrl+NNew session",
      "Ctrl+,Settings",
    ]);
  });

  it("lists the Playground in the sidebar, with no sessions yet", async () => {
    startSessionsRust();
    renderApp();

    const playgroundName = await screen.findByRole("heading", { name: "Playground" });
    expect(playgroundName).toBeVisible();
    expect(within(sidebar()).getByText("No sessions yet.")).toBeVisible();
  });

  it("says so when the saved sessions could not be read, with the code", async () => {
    startSessionsRust({
      sessionsNotice: {
        code: "ARD-AGT-004",
        messageKey: "errors.ARD-AGT-004",
        details: "file is not a database",
      },
    });
    renderApp();

    await screen.findByText("Notice (ARD-AGT-004)");
    // The notice slides in.
    await waitFor(() => {
      expect(screen.getByText("Notice (ARD-AGT-004)")).toBeVisible();
    });
    expect(
      screen.getByText(
        "Your saved sessions could not be read, so Arden Code started without them.",
      ),
    ).toBeVisible();
  });

  it("says so when a reply could not be saved", async () => {
    startSessionsRust();
    renderApp();
    await screen.findByRole("heading", { name: "What should the Demo agent work on?" });

    await emit("reply-not-saved", {
      notice: { code: "ARD-AGT-003", messageKey: "errors.ARD-AGT-003", details: "disk full" },
    });

    await screen.findByText("Notice (ARD-AGT-003)");
    await waitFor(() => {
      expect(screen.getByText("Notice (ARD-AGT-003)")).toBeVisible();
    });
    expect(screen.getByText("Your sessions are not being saved.")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    startSessionsRust();
    const { container } = render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    await screen.findByRole("heading", { name: "What should the Demo agent work on?" });

    await expectNoAccessibilityViolations(container);
  });
});

describe("Starting a session", () => {
  it("starts one from the welcome state, opens it and sends the first message", async () => {
    const rust = startSessionsRust();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "What should the Demo agent work on?" });

    await user.keyboard("Hello from the welcome state{Enter}");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Hello from the welcome state" }),
    ).toBeVisible();
    expect(rust.calls.filter((call) => call.command === "create_session")).toHaveLength(1);
    expect(rust.sent()[0]?.payload).toMatchObject({
      sessionId: "session-1",
      text: "Hello from the welcome state",
    });
    expect(
      await screen.findByText("Hello from the welcome state", { selector: "p" }),
    ).toBeVisible();
  });

  it("keeps the text in the welcome state when the session cannot be started", async () => {
    startSessionsRust({ failCreate: true });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "What should the Demo agent work on?" });

    await user.keyboard("Keep this{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Something went wrong (ARD-AGT-001)")).toBeVisible();
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Keep this");
  });

  it("starts a Demo agent session with Ctrl+N, lists it and lets you write in it at once", async () => {
    const rust = startSessionsRust();
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
    startSessionsRust();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.click(within(sidebar()).getByRole("button", { name: "New session" }));

    expect(await messageBox()).toHaveFocus();
  });

  it("shows the error code when a session cannot be started", async () => {
    startSessionsRust({ failCreate: true });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}n{/Control}");

    await screen.findByText("Something went wrong (ARD-AGT-001)");
    await waitFor(() => {
      expect(screen.getByText("Something went wrong (ARD-AGT-001)")).toBeVisible();
    });
    // Still on the welcome state: no session was opened.
    expect(
      screen.getByRole("heading", { level: 1, name: "What should the Demo agent work on?" }),
    ).toBeVisible();
  });

  it("tells Rust which session is open, so that it opens again at the next start", async () => {
    const rust = startSessionsRust();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}n{/Control}");
    await messageBox();

    await waitFor(() => {
      expect(
        rust.calls
          .filter((call) => call.command === "remember_open_session")
          .map((call) => call.payload),
      ).toEqual([{ id: "session-1" }]);
    });
  });

  it("says so when a session does not exist any more, and offers a new one", async () => {
    startSessionsRust();
    renderApp("/session/session-99");

    const message = await screen.findByText("That session does not exist any more.");
    expect(message).toBeVisible();
    expect(
      within(screen.getByRole("main")).getByRole("button", { name: "New session" }),
    ).toBeVisible();
  });
});

async function openSession(rust: ReturnType<typeof startSessionsRust>) {
  const user = userEvent.setup();
  renderApp();
  await screen.findByRole("main");
  await user.keyboard("{Control>}n{/Control}");
  await messageBox();
  return { user, rust };
}

describe("Sending a message", () => {
  it("sends on Enter, streams the reply into the view and names the session after the message", async () => {
    const rust = startSessionsRust();
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
    const rust = startSessionsRust({ emitBeforeAnswering: [delta("Quick "), delta("reply.")] });
    const { user } = await openSession(rust);

    await user.keyboard("Hi{Enter}");

    expect(await screen.findByText("Quick reply.")).toBeVisible();
  });

  it("adds a line on Shift+Enter and sends nothing", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);

    await user.keyboard("first{Shift>}{Enter}{/Shift}second");

    expect(await messageBox()).toHaveValue("first\nsecond");
    expect(rust.sent()).toHaveLength(0);
  });

  it("does not send on the Enter that confirms a composed character", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    const box = await messageBox();
    await user.type(box, "こんにちは");

    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });

    expect(rust.sent()).toHaveLength(0);
    expect(box).toHaveValue("こんにちは");
  });

  it("sends nothing for an empty message, and nothing while the last reply is still coming", async () => {
    const rust = startSessionsRust();
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
    // While the reply runs, the button stops it instead of sending.
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    rust.emit({ type: "finished", turnId: "turn-1" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    });
  });

  it("shows every kind of item as the reply streams in", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("show me everything{Enter}");
    await screen.findByText("The Demo agent is replying…");

    rust.emit(item({ type: "status", id: "s", kind: "started" }));
    rust.emit(item({ type: "thinking", id: "t", text: "" }));
    rust.emit({ type: "textDelta", turnId: "turn-1", itemId: "t", text: "Let me look." });
    rust.emit(
      item({
        type: "toolCall",
        id: "c",
        name: "read_file",
        input: "README.md",
        status: "running",
        output: null,
      }),
    );
    expect(await screen.findByText("Running…")).toBeVisible();
    rust.emit({
      type: "toolCallEnded",
      turnId: "turn-1",
      itemId: "c",
      status: "done",
      output: "42 lines",
    });
    rust.emit(delta("Here is **the answer**."));
    rust.emit(
      item({
        type: "fileChange",
        id: "f",
        path: "src/main.ts",
        change: "modified",
        added: 3,
        removed: 1,
      }),
    );
    rust.emit(item({ type: "error", id: "e", message: "Something broke." }));
    rust.emit({ type: "failed", turnId: "turn-1" });

    expect(await screen.findByText("The agent started working")).toBeVisible();
    expect(screen.getByText("Thinking")).toBeVisible();
    expect(screen.getByText("Let me look.")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeVisible();
    expect(await screen.findByText("42 lines")).toBeVisible();
    expect(screen.queryByText("Running…")).toBeNull();
    // Markdown is drawn, not printed.
    expect(await screen.findByText("the answer")).toBeVisible();
    expect(screen.queryByText(/\*\*/u)).toBeNull();
    expect(screen.getByText("src/main.ts")).toBeVisible();
    expect(screen.getByText("Something broke.", { exact: false })).toBeVisible();
    expect(screen.getByText("The reply stopped.")).toBeVisible();
  });

  it("marks a reply that stopped", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");

    rust.emit({ type: "failed", turnId: "turn-1" });

    expect(await screen.findByText("The reply stopped.")).toBeVisible();
  });

  it("stops the reply with Esc, and the turn says it was stopped", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");
    rust.emit(delta("Half of a sen"));

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(rust.stops()).toHaveLength(1);
    });
    expect(rust.stops()[0]?.payload).toMatchObject({ sessionId: "session-1" });
    // Rust ends the reply, and tells the channel.
    rust.emit({ type: "stopped", turnId: "turn-1" });
    expect(await screen.findByText("You stopped the reply")).toBeVisible();
    expect(screen.queryByText("The Demo agent is replying…")).toBeNull();
    expect(screen.getByText("Half of a sen")).toBeVisible();
    // The session is free for the next message.
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();
    });
  });

  it("leaves Esc alone when no reply is running", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    const box = await messageBox();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    box.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
    expect(rust.stops()).toHaveLength(0);
    await user.keyboard("{Escape}");
    expect(rust.stops()).toHaveLength(0);
  });

  it("uses Esc to close a dialog first, and does not stop the reply behind it", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");
    await user.keyboard("{Control>}/{/Control}");
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(rust.stops()).toHaveLength(0);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(rust.stops()).toHaveLength(1);
    });
  });

  it("offers Stop the reply in the command palette only while a reply is running", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Command palette" });
    expect(screen.queryByRole("option", { name: /Stop the reply/ })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await user.click(await messageBox());
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");

    await user.keyboard("{Control>}k{/Control}");

    // The palette fades in; it is only visible once it has.
    await animationsDone(await screen.findByRole("dialog", { name: "Command palette" }));
    expect(await screen.findByRole("option", { name: /Stop the reply/ })).toBeVisible();
    rust.emit({ type: "finished", turnId: "turn-1" });
  });

  it("stops the reply from the message box: Send becomes Stop while a reply runs", async () => {
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");

    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Stop the reply" }));

    await waitFor(() => {
      expect(rust.stops()).toHaveLength(1);
    });
    rust.emit({ type: "stopped", turnId: "turn-1" });
    expect(await screen.findByRole("button", { name: "Send" })).toBeVisible();
  });

  it("stores the time in UTC and shows it in local time", async () => {
    const rust = startSessionsRust({ regionalFormat: "english" });
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
    const rust = startSessionsRust();
    const { user } = await openSession(rust);
    await user.keyboard("hello{Enter}");
    await screen.findByText("The Demo agent is replying…");
    rust.emit(delta("A reply."));
    await screen.findByText("A reply.");

    await expectNoAccessibilityViolations(document.body);
  });
});

/** A session with one finished turn: a tool call, then text. */
async function sessionWithEverything() {
  const rust = startSessionsRust();
  const { user } = await openSession(rust);
  await user.keyboard("show me everything{Enter}");
  await screen.findByText("The Demo agent is replying…");
  rust.emit(
    item({
      type: "toolCall",
      id: "c",
      name: "read_file",
      input: "README.md",
      status: "done",
      output: "42 lines",
    }),
  );
  rust.emit(delta("Here is the answer."));
  rust.emit({ type: "finished", turnId: "turn-1" });
  await screen.findByText("Here is the answer.");
  return rust;
}

const box = (element: Element) => element.getBoundingClientRect();

describe("The session view's layout", () => {
  it("sets the turns in a centered reading column, 45rem at most", async () => {
    await sessionWithEverything();
    const transcript = screen.getByRole("main", { name: "Session" });
    const feed = within(transcript).getByRole("feed");

    expect(box(feed).width).toBeLessThanOrEqual(720);
    const before = box(feed).left - box(transcript).left;
    const after = box(transcript).right - box(feed).right;
    expect(Math.abs(before - after)).toBeLessThan(20);
  });

  it("shows the person's message as a filled block at the end of the line", async () => {
    await sessionWithEverything();
    const message = screen.getByText("show me everything", { selector: "p" });
    const feed = screen.getByRole("feed");

    expect(getComputedStyle(message).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(box(feed).right - box(message).right).toBeLessThan(2);
    expect(box(message).left).toBeGreaterThan(box(feed).left + 100);
  });

  it("draws a tool call as a quiet line, not a box", async () => {
    await sessionWithEverything();
    const call = screen.getByText("read_file").closest("[data-item]");
    if (!call) throw new Error("the tool call is not an item");

    expect(getComputedStyle(call).borderTopWidth).toBe("0px");
    expect(getComputedStyle(call).borderBottomWidth).toBe("0px");
  });

  it("gives the message box room for two lines, and names the agent and the project under it", async () => {
    await sessionWithEverything();
    const area = document.querySelector("[data-area=messagebox]");
    if (!(area instanceof HTMLElement)) throw new Error("no message box area");
    const textBox = within(area).getByRole("textbox", { name: "Message" });
    const lineHeight = Number.parseFloat(getComputedStyle(textBox).lineHeight);

    expect(box(textBox).height).toBeGreaterThanOrEqual(lineHeight * 2);
    expect(within(area).getByText("Demo agent · Playground")).toBeVisible();
  });
});
