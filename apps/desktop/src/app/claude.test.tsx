import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotIcon, FolderIcon } from "lucide-react";
import { page } from "vitest/browser";

import type { ContextWindow, Item, Session, UsageLimits } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { drawingOf, drawingsIn } from "@/test/icons";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entry = "/") {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

/** The message box's area, once the page shows it. */
async function messageBoxArea(): Promise<HTMLElement> {
  await screen.findByRole("textbox", { name: "Message" });
  const area = document.querySelector("[data-area=messagebox]");
  if (!(area instanceof HTMLElement)) throw new Error("no message box area");
  return area;
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

  it("names the agent and the project of a session that has had a message in its header, under its reply too", async () => {
    startSessionsRust({ sessions: [answeredClaudeSession()] });
    renderApp("/session/session-1");

    const title = await screen.findByRole("heading", { level: 1, name: "Fix the build" });
    const header = title.closest("header");
    if (!header) throw new Error("the title is not in a header");
    expect(within(header).getByText("Claude")).toBeVisible();
    expect(within(header).getByText("Playground")).toBeVisible();
    expect(drawingsIn(header)).toEqual(
      expect.arrayContaining([drawingOf(BotIcon), drawingOf(FolderIcon)]),
    );
    expect(screen.queryByRole("button", { name: /^Agent:/u })).toBeNull();
    // The message box's lower line holds only what the next message can change.
    const area = document.querySelector("[data-area=messagebox]");
    if (!(area instanceof HTMLElement)) throw new Error("no message box area");
    expect(within(area).queryByText(/Playground/u)).toBeNull();
    const feed = screen.getByRole("feed", { name: "Messages" });
    expect(within(feed).getByRole("heading", { level: 3, name: "Claude" })).toBeVisible();
  });

  it("names the agent and the project of an archived session in its header too", async () => {
    startSessionsRust({
      sessions: [{ ...answeredClaudeSession(), archivedAt: "2026-10-04T08:00:00Z" }],
    });
    renderApp("/session/session-1");

    const title = await screen.findByRole("heading", { level: 1, name: "Fix the build" });
    const header = title.closest("header");
    if (!header) throw new Error("the title is not in a header");
    expect(within(header).getByText("Claude")).toBeVisible();
    expect(within(header).getByText("Playground")).toBeVisible();
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

describe("Approval requests (ADR 0039)", () => {
  const request = {
    type: "approval",
    id: "turn-1-approval-1",
    toolCallId: null,
    action: "runCommand",
    subject: "npm test",
    detail: "Run the tests",
    rule: "Bash(npm test:*)",
    state: "waiting",
  } as const;

  it("asks before Claude acts, says Claude waits, and hands the answer back", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Run the tests{Enter}",
    );
    await screen.findByText("Claude is replying…");

    rust.emit({ type: "itemAdded", turnId: "turn-1", item: request });

    const card = await screen.findByRole("group", { name: "Claude wants to run a command" });
    expect(within(card).getByText("npm test")).toBeVisible();
    const statusBar = screen.getByRole("contentinfo");
    expect(within(statusBar).getByText("Claude: waiting for your answer")).toBeVisible();
    // The focus stays where the person put it: the card is reached with Tab when they want it.
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();

    await user.click(within(card).getByRole("button", { name: "Always allow" }));

    expect(rust.callsTo("answer_approval")).toEqual([
      { sessionId: "session-1", itemId: "turn-1-approval-1", answer: "alwaysAllow" },
    ]);
    rust.emit({
      type: "itemAdded",
      turnId: "turn-1",
      item: { ...request, state: "alwaysAllowed" },
    });
    expect(await screen.findByText("You always allowed")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Claude wants to run a command" })).toBeNull();
    expect(within(statusBar).getByText("Claude: replying")).toBeVisible();
  });

  it("is reached with Shift+Tab from the message box, and answered with the keyboard", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Run the tests{Enter}",
    );
    await screen.findByText("Claude is replying…");
    rust.emit({ type: "itemAdded", turnId: "turn-1", item: request });
    const card = await screen.findByRole("group", { name: "Claude wants to run a command" });

    await user.tab({ shift: true });
    expect(within(card).getByRole("button", { name: "Deny" })).toHaveFocus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(within(card).getByRole("button", { name: "Allow" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(rust.callsTo("answer_approval")).toEqual([
      { sessionId: "session-1", itemId: "turn-1-approval-1", answer: "allow" },
    ]);
  });

  it("has no accessibility violations with a request waiting", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Run the tests{Enter}",
    );
    await screen.findByText("Claude is replying…");
    rust.emit({ type: "itemAdded", turnId: "turn-1", item: request });
    await screen.findByRole("group", { name: "Claude wants to run a command" });

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("Claude's questions (ADR 0039)", () => {
  it("shows Claude's questions, says Claude waits, and sends the answers", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null, "playground", "claude")],
    });
    renderApp("/session/session-1");
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Set it up{Enter}");
    await screen.findByText("Claude is replying…");
    const asking: Extract<Item, { type: "questions" }> = {
      type: "questions",
      id: "turn-1-questions-1",
      toolCallId: null,
      questions: [
        {
          header: "Library",
          question: "Which library should the app use?",
          options: [
            { label: "React", description: null },
            { label: "Vue", description: null },
          ],
          multiSelect: false,
        },
      ],
      answers: [],
      state: "waiting",
    };

    rust.emit({ type: "itemAdded", turnId: "turn-1", item: asking });

    const card = await screen.findByRole("form", { name: "Claude asks you" });
    const statusBar = screen.getByRole("contentinfo");
    expect(within(statusBar).getByText("Claude: waiting for your answer")).toBeVisible();
    await user.click(within(card).getByRole("radio", { name: "Vue" }));
    await user.click(within(card).getByRole("button", { name: "Send answers" }));

    const answers = [{ question: "Which library should the app use?", answer: "Vue" }];
    expect(rust.callsTo("answer_questions")).toEqual([
      { sessionId: "session-1", itemId: "turn-1-questions-1", answers },
    ]);
    rust.emit({
      type: "itemAdded",
      turnId: "turn-1",
      item: { ...asking, answers, state: "answered" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "Claude asks you" })).toBeNull();
    });
    expect(screen.getByText("Vue")).toBeVisible();
    expect(within(statusBar).getByText("Claude: replying")).toBeVisible();
  });
});

/** A Claude session in a folder opened as a project, which the person may have trusted. */
function claudeInAFolder(trusted = false) {
  return startSessionsRust({
    folders: [folderProject("folder-1", "demo", trusted)],
    sessions: [sessionNamed("session-1", null, "folder-1", "claude")],
  });
}

describe("Trusting a folder (ADR 0039)", () => {
  it("asks before Claude first works in a folder, and Trust folder sends the message", async () => {
    const user = userEvent.setup();
    const rust = claudeInAFolder();
    renderApp("/session/session-1");
    const box = await screen.findByRole("textbox", { name: "Message" });

    await user.type(box, "Fix the build{Enter}");

    const question = await screen.findByRole("alertdialog", { name: "Trust “demo”?" });
    expect(question.textContent).toContain("hooks, MCP servers and environment settings");
    expect(question.textContent).toContain(String.raw`C:\Work\demo`);
    expect(rust.sent()).toHaveLength(0);
    await user.click(within(question).getByRole("button", { name: "Trust folder" }));

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.callsTo("trust_project")).toEqual([{ projectId: "folder-1" }]);
    expect(rust.callsTo("send_message")[0]).toMatchObject({ text: "Fix the build" });
    expect(box).toHaveValue("");
    expect(await screen.findByText("Claude is replying…")).toBeVisible();
  });

  it("keeps the message in the box when the question is cancelled, and asks again next time", async () => {
    const user = userEvent.setup();
    const rust = claudeInAFolder();
    renderApp("/session/session-1");
    const box = await screen.findByRole("textbox", { name: "Message" });
    await user.type(box, "Fix the build{Enter}");
    const question = await screen.findByRole("alertdialog", { name: "Trust “demo”?" });

    await user.click(within(question).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(box).toHaveValue("Fix the build");
    expect(box).toHaveFocus();
    expect(rust.sent()).toHaveLength(0);
    expect(rust.callsTo("trust_project")).toEqual([]);
    await user.keyboard("{Enter}");
    const again = await screen.findByRole("alertdialog", { name: "Trust “demo”?" });
    await animationsDone(again);
    expect(again).toBeVisible();
  });

  it("asks nothing in a folder that is trusted, or in the Playground", async () => {
    const user = userEvent.setup();
    const rust = claudeInAFolder(true);
    renderApp("/session/session-1");

    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Fix the build{Enter}",
    );

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("has no accessibility violations while it asks", async () => {
    const user = userEvent.setup();
    claudeInAFolder();
    renderApp("/session/session-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Fix the build{Enter}",
    );
    await animationsDone(await screen.findByRole("alertdialog"));

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("Choosing where a session works (ADR 0039)", () => {
  it("offers the Playground, every folder and Open folder, and choosing a folder moves the session", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      folders: [folderProject("folder-1", "demo")],
      sessions: [sessionNamed("session-1", null)],
    });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Project: Playground" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.querySelector("[data-name]")?.textContent),
    ).toEqual(["Playground", "demo"]);
    expect(within(menu).getByRole("menuitem", { name: /^Open folder…/ })).toBeVisible();
    await expectNoAccessibilityViolations(menu);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^demo/ }));

    expect(rust.callsTo("set_session_project")).toEqual([
      { id: "session-1", projectId: "folder-1" },
    ]);
    expect(await screen.findByRole("button", { name: "Project: demo" })).toBeVisible();
  });

  it("opens a folder from the menu and moves the empty session to it", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      sessions: [sessionNamed("session-1", null)],
      pickedFolder: folderProject("folder-2", "api"),
    });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Project: Playground" }));
    await animationsDone(await screen.findByRole("menu"));
    await user.click(screen.getByRole("menuitem", { name: /^Open folder…/ }));

    expect(await screen.findByRole("button", { name: "Project: api" })).toBeVisible();
    expect(rust.callsTo("pick_folder")).toHaveLength(1);
    expect(rust.callsTo("set_session_project")).toEqual([
      { id: "session-1", projectId: "folder-2" },
    ]);
    expect(rust.callsTo("create_session")).toEqual([]);
  });

  it("opens a folder with Ctrl+O and starts a session in it", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ pickedFolder: folderProject("folder-2", "api") });
    renderApp("/");
    await screen.findByRole("main");

    await user.keyboard("{Control>}o{/Control}");

    expect(await screen.findByRole("button", { name: "Project: api" })).toBeVisible();
    expect(rust.callsTo("create_session")).toEqual([{ agent: null, projectId: "folder-2" }]);
  });

  it("does nothing when the folder dialog is cancelled", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ pickedFolder: null });
    renderApp("/");
    await screen.findByRole("main");

    await user.keyboard("{Control>}o{/Control}");

    await waitFor(() => {
      expect(rust.callsTo("pick_folder")).toHaveLength(1);
    });
    expect(rust.callsTo("create_session")).toEqual([]);
  });

  it("starts a new session with Ctrl+N in the open session's folder", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({
      folders: [folderProject("folder-1", "demo", true)],
      sessions: [answeredClaudeSession(), sessionNamed("session-2", "In demo", "folder-1")],
    });
    renderApp("/session/session-2");
    await screen.findByRole("heading", { level: 1, name: "In demo" });

    await user.keyboard("{Control>}n{/Control}");

    expect(await screen.findByRole("button", { name: "Project: demo" })).toBeVisible();
    expect(rust.callsTo("create_session")).toEqual([{ agent: null, projectId: "folder-1" }]);
  });
});

describe("Deleting a Claude session (ADR 0039)", () => {
  it("says Claude Code keeps its own copy of the conversation", async () => {
    const user = userEvent.setup();
    const rust = startSessionsRust({ sessions: [answeredClaudeSession()] });
    renderApp("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Actions for Fix the build" }));
    await animationsDone(await screen.findByRole("menu"));
    await user.click(screen.getByRole("menuitem", { name: /Delete/u }));
    const question = await screen.findByRole("alertdialog", { name: "Delete this session?" });

    expect(question).toHaveTextContent(
      "“Fix the build” and all of its messages will be deleted. This cannot be undone. Claude Code keeps its own copy of the conversation in its folder.",
    );
    await user.click(within(question).getByRole("button", { name: "Delete session" }));
    expect(rust.callsTo("delete_session")).toEqual([{ id: "session-1" }]);
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
    expect(screen.getByRole("button", { name: "Agent: Claude" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Project: Playground" })).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toEqual([
        { agent: "claude", projectId: "playground" },
      ]);
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

describe("The figures in the message box (ADR 0044)", () => {
  const plan: UsageLimits = {
    report: "reported",
    windows: [
      { kind: "fiveHour", percent: 42, resetsAt: "2099-10-09T15:10:00Z", status: "allowed" },
      { kind: "weekly", percent: 18, resetsAt: "2099-10-13T09:00:00Z", status: "allowed" },
    ],
  };

  it("shows the usage limits before Send in a Claude session's message box", async () => {
    startSessionsRust({ sessions: [answeredClaudeSession()], usageLimits: plan });
    renderApp("/session/session-1");
    const area = await messageBoxArea();

    const figures = await within(area).findByRole("button", { name: "5-hour 42% Weekly 18%" });
    const send = within(area).getByRole("button", { name: "Send" });
    expect(figures.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no usage limits in a Demo agent session's message box", async () => {
    startSessionsRust({
      sessions: [sessionNamed("session-1", "Hi", "playground", "demo")],
      usageLimits: plan,
    });
    renderApp("/session/session-1");
    const area = await messageBoxArea();

    await screen.findByRole("heading", { level: 1, name: "Hi" });
    expect(within(area).queryByText(/5-hour/u)).toBeNull();
  });

  it("shows how full a Claude session's context window is, and follows its replies", async () => {
    const user = userEvent.setup();
    const contextWindow: ContextWindow = {
      used: 26_000,
      size: 200_000,
      percent: 13,
      compactsAt: 167_000,
      parts: [{ name: "Messages", tokens: 10_000, kind: "used" }],
    };
    const rust = startSessionsRust({ sessions: [{ ...answeredClaudeSession(), contextWindow }] });
    renderApp("/session/session-1");
    const area = await messageBoxArea();
    expect(await within(area).findByRole("button", { name: "Context 13%" })).toBeVisible();

    await user.type(within(area).getByRole("textbox", { name: "Message" }), "More{Enter}");
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    rust.emit({ type: "finished", turnId: "turn-2" });
    rust.emit({
      type: "contextWindowChanged",
      turnId: "turn-2",
      contextWindow: { ...contextWindow, used: 40_000, percent: 20 },
    });

    expect(await within(area).findByRole("button", { name: "Context 20%" })).toBeVisible();
  });

  it("shows the usage limits on the welcome screen while Claude is chosen", async () => {
    startSessionsRust({ newSessionAgent: "claude", usageLimits: plan });
    renderApp();

    expect(await screen.findByRole("button", { name: "5-hour 42% Weekly 18%" })).toBeVisible();
  });
});
