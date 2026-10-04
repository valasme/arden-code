import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { archivedAt, folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

const work = folderProject("work", "arden-code", true);

/** Rust with a Playground session and three in arden-code, one of them archived. */
async function withProject(entry = "/") {
  const rust = startSessionsRust({
    folders: [work],
    sessions: [
      sessionNamed("s1", "Try a prompt"),
      sessionNamed("s2", "Fix login", "work"),
      sessionNamed("s3", "Write the docs", "work"),
      { ...sessionNamed("s4", "Old plan", "work"), archivedAt },
    ],
  });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
  await screen.findByRole("link", { name: "Fix login" });
  return { rust, user };
}

const sidebar = () => screen.getByRole("complementary", { name: "Sidebar" });

async function askToRemove(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(sidebar()).getByRole("button", { name: "Actions for arden-code" }));
  const item = await screen.findByRole("menuitem", { name: "Remove project…" });
  await animationsDone(await screen.findByRole("menu"));
  await user.click(item);
  return screen.findByRole("alertdialog", { name: "Remove “arden-code”?" });
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Removing a project", () => {
  it("is offered for a folder project, and not for the Playground", async () => {
    await withProject();

    expect(
      within(sidebar()).getByRole("button", { name: "Actions for arden-code" }),
    ).toBeInTheDocument();
    expect(within(sidebar()).queryByRole("button", { name: "Actions for Playground" })).toBeNull();
  });

  it("asks first, saying how many sessions go, archived ones included", async () => {
    const { rust, user } = await withProject();

    const question = await askToRemove(user);

    expect(question).toHaveTextContent(
      "Its 3 sessions, including 1 archived, will be deleted. Claude Code keeps its own copies of its conversations. The folder itself stays.",
    );
    await waitFor(() => {
      expect(within(question).getByRole("button", { name: "Cancel" })).toHaveFocus();
    });
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(rust.callsTo("remove_project")).toEqual([]);
  });

  it("removes the project and its sessions once confirmed", async () => {
    const { rust, user } = await withProject();

    const question = await askToRemove(user);
    await user.click(within(question).getByRole("button", { name: "Remove project" }));

    await waitFor(() => {
      expect(rust.callsTo("remove_project")).toEqual([{ projectId: "work" }]);
    });
    await waitFor(() => {
      expect(within(sidebar()).queryByRole("heading", { name: "arden-code" })).toBeNull();
    });
    expect(within(sidebar()).getByRole("link", { name: "Try a prompt" })).toBeVisible();
    expect(await screen.findByText("Project removed")).toBeInTheDocument();
  });

  it("goes to the welcome state when the open session was in it", async () => {
    const { user } = await withProject("/session/s2");
    await screen.findByRole("heading", { level: 1, name: "Fix login" });

    const question = await askToRemove(user);
    await user.click(within(question).getByRole("button", { name: "Remove project" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: /What should the Demo agent work on/ }),
    ).toBeVisible();
  });

  it("is in the menu of a right click on the project's name", async () => {
    const { user } = await withProject();

    await user.pointer({
      keys: "[MouseRight]",
      target: within(sidebar()).getByRole("heading", { name: "arden-code" }),
    });

    const item = await screen.findByRole("menuitem", { name: "Remove project…" });
    await waitFor(() => {
      expect(item).toBeVisible();
    });
  });

  it("has no accessibility violations while it asks", async () => {
    const { user } = await withProject();

    await animationsDone(await askToRemove(user));

    await expectNoAccessibilityViolations(document.body);
  });
});
