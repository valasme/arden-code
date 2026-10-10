import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone, menuClosed } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

type Options = Parameters<typeof startSessionsRust>[0];

async function welcome(options: Options = {}) {
  const rust = startSessionsRust(options);
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
  await screen.findByRole("heading", { level: 1, name: /work on\?/ });
  return { rust, user };
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
      expect(rust.callsTo("create_session")).toEqual([{ agent: "claude", projectId: "api" }]);
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
      expect(rust.callsTo("create_session")).toEqual([{ agent: "claude", projectId: "api" }]);
    });
    expect(rust.callsTo("trust_project")).toEqual([{ projectId: "api" }]);
  });

  it("chooses a folder opened from the menu, without starting a session", async () => {
    const { rust, user } = await welcome({ pickedFolder: folderProject("web", "web") });

    await choose(user, "Project: Playground", /^Open folder…/);

    expect(await within(await main()).findByRole("button", { name: "Project: web" })).toBeVisible();
    expect(rust.callsTo("create_session")).toEqual([]);
  });

  it("has no accessibility violations", async () => {
    await welcome();

    await expectNoAccessibilityViolations(document.body);
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
