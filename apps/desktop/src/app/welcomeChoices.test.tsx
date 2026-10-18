import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { NewSession } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone, menuClosed } from "@/test/animations";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

type Options = Parameters<typeof startSessionsRust>[0];

/** What a Claude session starts with when nothing was inherited or chosen. */
const claudeAsItStarts: NewSession = {
  agent: "claude",
  model: null,
  effort: null,
  permissionMode: "manual",
};

async function welcome(options: Options = {}) {
  const rust = startSessionsRust(options);
  const user = userEvent.setup();
  const history = createMemoryHistory({ initialEntries: ["/"] });
  render(<App history={history} />);
  await screen.findByRole("heading", { level: 1, name: /work on\?/ });
  return { rust, user, history };
}

/**
 * The welcome screen. A menu hides the page from the accessibility tree until it has quite closed,
 * so this waits for it to be there again.
 */
const main = () => screen.findByRole("main");

async function choose(user: ReturnType<typeof userEvent.setup>, button: string, item: RegExp) {
  await user.click(await within(await main()).findByRole("button", { name: button }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  const role = item.source.includes("Open folder") ? "menuitem" : "menuitemradio";
  await user.click(await within(menu).findByRole(role, { name: item }));
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

describe("Choosing the agent and the project on the welcome screen", () => {
  it("shows both menus, with the Playground on a first run", async () => {
    await welcome();

    const welcomeScreen = await main();
    expect(within(welcomeScreen).getByRole("button", { name: "Agent: Demo agent" })).toBeVisible();
    expect(
      within(welcomeScreen).getByRole("button", { name: "Project: Playground" }),
    ).toBeVisible();
  });

  it("chooses the project of the latest session in advance", async () => {
    await welcome({
      folders: [folderProject("api", "api", true)],
      sessions: [
        sessionNamed("s1", "Earlier"),
        { ...sessionNamed("s2", "Latest", "api"), updatedAt: "2026-10-01T09:00:00Z" },
      ],
    });

    expect(await within(await main()).findByRole("button", { name: "Project: api" })).toBeVisible();
  });

  it("starts the session with the chosen agent in the chosen project, and sends the message", async () => {
    const { rust, user } = await welcome({ folders: [folderProject("api", "api", true)] });

    await choose(user, "Project: Playground", /^api/);
    await choose(user, "Agent: Demo agent", /^Claude/);
    expect(
      await screen.findByRole("heading", { level: 1, name: "What should Claude work on?" }),
    ).toBeVisible();
    await user.type(within(await main()).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toEqual([
        { projectId: "api", start: claudeAsItStarts },
      ]);
    });
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
  });

  it("asks to trust a folder before Claude first works there, and Cancel keeps the message", async () => {
    const { rust, user } = await welcome({ folders: [folderProject("api", "api", false)] });

    await choose(user, "Project: Playground", /^api/);
    await choose(user, "Agent: Demo agent", /^Claude/);
    const box = within(await main()).getByRole("textbox", { name: "Message" });
    await user.type(box, "Hello{Enter}");

    const question = await screen.findByRole("alertdialog", { name: "Trust “api”?" });
    await user.click(within(question).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(box).toHaveValue("Hello");
    });
    expect(rust.callsTo("create_session")).toEqual([]);
  });

  it("trusts the folder when told to, then starts the session there", async () => {
    const { rust, user } = await welcome({ folders: [folderProject("api", "api", false)] });

    await choose(user, "Project: Playground", /^api/);
    await choose(user, "Agent: Demo agent", /^Claude/);
    await user.type(within(await main()).getByRole("textbox", { name: "Message" }), "Hello{Enter}");
    const question = await screen.findByRole("alertdialog", { name: "Trust “api”?" });
    await user.click(within(question).getByRole("button", { name: "Trust folder" }));

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toEqual([
        { projectId: "api", start: claudeAsItStarts },
      ]);
    });
    expect(rust.callsTo("trust_project")).toEqual([{ projectId: "api" }]);
  });

  it("starts the session with what was chosen and what was inherited, in one call", async () => {
    const { rust, user } = await welcome({
      newSession: { agent: "claude", model: "opus", effort: "high", permissionMode: "plan" },
    });

    await choose(user, "Effort: High", /^Max/);
    await choose(user, "Permission mode: Plan", /^Accept edits/);
    await user.type(within(await main()).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.callsTo("create_session")).toEqual([
      {
        projectId: "playground",
        start: { agent: "claude", model: "opus", effort: "max", permissionMode: "acceptEdits" },
      },
    ]);
    const changes = new Set([
      "set_session_model",
      "set_session_effort",
      "set_session_permission_mode",
    ]);
    expect(rust.calls.filter((call) => changes.has(call.command))).toEqual([]);
  });

  it("sends nothing and keeps the message when the session cannot start", async () => {
    const { rust, user } = await welcome({ failCreate: true });

    const box = within(await main()).getByRole("textbox", { name: "Message" });
    await user.type(box, "Hello{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toHaveLength(1);
    });
    expect(rust.sent()).toEqual([]);
    expect(box).toHaveValue("Hello");
  });

  it("chooses a folder opened from the menu, without starting a session", async () => {
    const { rust, user } = await welcome({ pickedFolder: folderProject("web", "web") });

    await choose(user, "Project: Playground", /^Open folder…/);

    expect(await within(await main()).findByRole("button", { name: "Project: web" })).toBeVisible();
    expect(rust.callsTo("create_session")).toEqual([]);
  });
});

/** How far down the page the middle of the welcome screen's button with this name is. */
async function middleOf(name: string) {
  const box = (await within(await main()).findByRole("button", { name })).getBoundingClientRect();
  return box.top + box.height / 2;
}

/** Turns on the Ultrathink switch at the end of the effort menu, and closes the menu. */
async function turnOnUltrathink(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await within(await main()).findByRole("button", { name: /^Effort/ }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Ultrathink/ }));
  // The menu stays open to show the switch change; Escape closes it.
  await user.keyboard("{Escape}");
  await menuClosed();
}

describe("The welcome screen's message box (#127)", () => {
  it("fits the five menus, the Ultrathink chip and Send on one row at the window's usual size", async () => {
    // The maintainer's screenshot: Claude in arden-code, with Opus, Max, Manual and Ultrathink.
    const { user } = await welcome({
      folders: [folderProject("arden", "arden-code", true)],
      sessions: [sessionNamed("s1", "Earlier", "arden", "claude")],
      newSession: { agent: "claude", model: "opus", effort: "max" },
    });
    await turnOnUltrathink(user);
    await within(await main()).findByRole("button", { name: "Turn off Ultrathink" });

    expect(Math.abs((await middleOf("Send")) - (await middleOf("Agent: Claude")))).toBeLessThan(2);
  });
});

describe("The welcome screen's draft (#131)", () => {
  it("keeps what was written and chosen while the person is away", async () => {
    const { user, history } = await welcome({ folders: [folderProject("api", "api", true)] });
    await choose(user, "Project: Playground", /^api/);
    await choose(user, "Agent: Demo agent", /^Claude/);
    await choose(user, "Model: Default", /^Opus/);
    await turnOnUltrathink(user);
    await user.type(
      within(await main()).getByRole("textbox", { name: "Message" }),
      "Half a thought",
    );

    history.push("/settings");
    await screen.findByRole("heading", { level: 1, name: "General" });
    history.push("/");
    await screen.findByRole("heading", { level: 1, name: /work on\?/ });

    const back = await main();
    expect(within(back).getByRole("textbox", { name: "Message" })).toHaveValue("Half a thought");
    expect(within(back).getByRole("button", { name: "Agent: Claude" })).toBeVisible();
    expect(within(back).getByRole("button", { name: "Project: api" })).toBeVisible();
    expect(within(back).getByRole("button", { name: "Model: Opus" })).toBeVisible();
    expect(within(back).getByRole("button", { name: "Turn off Ultrathink" })).toBeVisible();
  });

  it("lets go of a chosen project once it is removed", async () => {
    const { user } = await welcome({
      folders: [folderProject("api", "api", true), folderProject("web", "web", true)],
      sessions: [
        sessionNamed("s1", "Earlier", "api"),
        { ...sessionNamed("s2", "Latest", "web"), updatedAt: "2026-10-01T09:00:00Z" },
      ],
    });
    await choose(user, "Project: web", /^api/);

    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("button", { name: "Actions for api" }));
    const item = await screen.findByRole("menuitem", { name: "Remove project…" });
    await animationsDone(await screen.findByRole("menu"));
    await user.click(item);
    const question = await screen.findByRole("alertdialog", { name: "Remove “api”?" });
    await user.click(within(question).getByRole("button", { name: "Remove project" }));

    expect(await within(await main()).findByRole("button", { name: "Project: web" })).toBeVisible();
  });

  it("starts afresh once its message has started a session", async () => {
    const { rust, user, history } = await welcome();
    await choose(user, "Agent: Demo agent", /^Claude/);
    await turnOnUltrathink(user);
    await user.type(within(await main()).getByRole("textbox", { name: "Message" }), "Hello{Enter}");
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });

    history.push("/");
    await screen.findByRole("heading", { level: 1, name: /work on\?/ });

    const back = await main();
    expect(within(back).getByRole("textbox", { name: "Message" })).toHaveValue("");
    // A new session there would take the Demo agent: the choice of Claude went with the message.
    expect(within(back).getByRole("button", { name: "Agent: Demo agent" })).toBeVisible();
  });
});

describe("Ultrathink on the welcome screen", () => {
  it("adds the word to the next message only, and turns itself off", async () => {
    const { rust, user } = await welcome();
    await choose(user, "Agent: Demo agent", /^Claude/);
    await screen.findByRole("heading", { level: 1, name: "What should Claude work on?" });

    await user.click(await within(await main()).findByRole("button", { name: /^Effort/ }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Ultrathink/ }));
    // The menu stays open to show the switch change; Escape closes it.
    await user.keyboard("{Escape}");
    await menuClosed();
    // The message box says the next message will carry the word (ADR 0044).
    expect(
      await within(await main()).findByRole("button", { name: "Turn off Ultrathink" }),
    ).toBeVisible();
    await user.type(within(await main()).getByRole("textbox", { name: "Message" }), "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ text: "Hello ultrathink" });
  });
});
