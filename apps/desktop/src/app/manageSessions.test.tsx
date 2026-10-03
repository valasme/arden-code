import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { ErrorCode } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { useSessionDialogsStore } from "@/state/sessionDialogs";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entry: string) {
  render(<App history={createMemoryHistory({ initialEntries: [entry] })} />);
}

const sidebar = () => screen.getByRole("complementary", { name: "Sidebar" });
const row = (name: string) => within(sidebar()).getByRole("link", { name });
const noMenu = () =>
  waitFor(() => {
    expect(screen.queryByRole("menu")).toBeNull();
  });
/** A menu item, once its menu has faded in. */
async function shownItem(name: RegExp) {
  const item = await screen.findByRole("menuitem", { name });
  await waitFor(() => {
    expect(item).toBeVisible();
  });
  return item;
}
/**
 * Waits for an element to have the focus. Radix moves the focus a moment after a menu or a dialog
 * comes or goes, not as it enters or leaves the page.
 */
const focusGoesTo = (element: HTMLElement) =>
  waitFor(() => {
    expect(element).toHaveFocus();
  });
/** Opens the command palette, and waits for it to have faded in. */
async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Control>}k{/Control}");
  await animationsDone(await screen.findByRole("dialog", { name: "Command palette" }));
}
const noDialog = () =>
  waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });

/** Rust with two sessions, and the app open at `entry`: the first session, unless said otherwise. */
async function twoSessions({
  entry = "/session/session-1",
  failing = {},
}: { entry?: string; failing?: Partial<Record<string, ErrorCode>> } = {}) {
  const rust = startSessionsRust({
    sessions: [
      sessionNamed("session-1", "Fix the build"),
      sessionNamed("session-2", "Write the docs"),
    ],
    failing,
  });
  const user = userEvent.setup();
  renderApp(entry);
  const bar = await screen.findByRole("complementary", { name: "Sidebar" });
  await within(bar).findByRole("link", { name: "Write the docs" });
  return { rust, user };
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
  useSessionDialogsStore.setState(useSessionDialogsStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("A session's menu", () => {
  it("opens from the … button at the end of the session's row", async () => {
    const { user } = await twoSessions();

    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Write the docs" }));

    const item = await shownItem(/Rename/);
    expect(screen.getByRole("menu")).toContainElement(item);
  });

  it("keeps the … buttons out of the Tab order, so Tab moves from row to row", async () => {
    const { user } = await twoSessions({ entry: "/" });
    row("Write the docs").focus();

    await user.tab();

    expect(row("Fix the build")).toHaveFocus();
  });

  it("opens with a right click on the row, with Shift+F10 and with the Menu key", async () => {
    const { user } = await twoSessions({ entry: "/" });

    await user.pointer({ keys: "[MouseRight]", target: row("Write the docs") });
    await shownItem(/Rename/);
    await user.keyboard("{Escape}");
    await noMenu();

    row("Write the docs").focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    // Opened from the keyboard, the menu starts on its first item, as a menu of Windows does.
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /Rename/ })).toHaveFocus();
    });
    await user.keyboard("{Escape}");
    await noMenu();
    await focusGoesTo(row("Write the docs"));

    await user.keyboard("{ContextMenu}");
    await shownItem(/Rename/);
  });

  it("opens for the open session from the button in its header", async () => {
    const { user } = await twoSessions();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));

    expect(await shownItem(/Rename/)).toBeVisible();
  });

  it("has no accessibility violations while it is open", async () => {
    const { user } = await twoSessions();
    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Write the docs" }));
    await animationsDone(await screen.findByRole("menu"));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** Opens the rename dialog of a session from its row's menu. */
async function renameFromTheMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(sidebar()).getByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
  return screen.findByRole("dialog", { name: "Rename session" });
}

describe("Renaming a session", () => {
  it("opens a dialog with the name selected, and saves the new one with Enter", async () => {
    const { rust, user } = await twoSessions();

    const dialog = await renameFromTheMenu(user, "Fix the build");
    const field = within(dialog).getByRole("textbox", { name: "Name" });
    expect(field).toHaveValue("Fix the build");
    await focusGoesTo(field);
    expect(field instanceof HTMLInputElement && [field.selectionStart, field.selectionEnd]).toEqual(
      [0, "Fix the build".length],
    );

    await user.keyboard("  The build is fixed  {Enter}");

    await noDialog();
    expect(rust.callsTo("rename_session")).toEqual([
      { id: "session-1", name: "The build is fixed" },
    ]);
    expect(
      await within(sidebar()).findByRole("link", { name: "The build is fixed" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "The build is fixed" })).toBeVisible();
  });

  it("does not save an empty name, and Esc leaves the name as it was", async () => {
    const { rust, user } = await twoSessions();
    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
    const dialog = await screen.findByRole("dialog", { name: "Rename session" });

    await user.keyboard("{Backspace}   ");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(rust.callsTo("rename_session")).toEqual([]);

    await user.keyboard("{Escape}");
    await noDialog();
    expect(rust.callsTo("rename_session")).toEqual([]);
    expect(screen.getByRole("heading", { level: 1, name: "Fix the build" })).toBeVisible();
    await focusGoesTo(screen.getByRole("button", { name: "Session actions" }));
  });

  it("renames the session whose row has the focus with F2, and otherwise the open session", async () => {
    const { user } = await twoSessions();
    row("Write the docs").focus();

    await user.keyboard("{F2}");
    const forTheRow = await screen.findByRole("dialog", { name: "Rename session" });
    expect(within(forTheRow).getByRole("textbox", { name: "Name" })).toHaveValue("Write the docs");
    await user.keyboard("{Escape}");
    await noDialog();
    await focusGoesTo(row("Write the docs"));

    screen.getByRole("textbox", { name: "Message" }).focus();
    await user.keyboard("{F2}");
    const forTheOpenSession = await screen.findByRole("dialog", { name: "Rename session" });
    expect(within(forTheOpenSession).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Fix the build",
    );
  });

  it("is in the command palette for the open session", async () => {
    const { user } = await twoSessions();

    await user.keyboard("{Control>}k{/Control}");
    await user.click(await screen.findByRole("option", { name: /Rename session/ }));

    // The dialog fades in as the palette fades out.
    const dialog = await screen.findByRole("dialog", { name: "Rename session" });
    await animationsDone(dialog);
    expect(dialog).toBeVisible();
  });

  it("says why in the dialog when the name cannot be saved, and keeps it open", async () => {
    const { user } = await twoSessions({ failing: { rename_session: "ARD-AGT-003" } });
    const dialog = await renameFromTheMenu(user, "Fix the build");

    await user.keyboard("Another name{Enter}");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your sessions are not being saved. (ARD-AGT-003)",
    );
    expect(screen.getByRole("dialog", { name: "Rename session" })).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Another name");
  });

  it("has no accessibility violations with the dialog open", async () => {
    const { user } = await twoSessions();
    await animationsDone(await renameFromTheMenu(user, "Fix the build"));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** The sessions listed under a heading of the sidebar, by name. */
function listedUnder(heading: string): string[] {
  const section = within(sidebar()).getByRole("heading", { name: heading }).closest("section");
  if (!section) throw new Error(`no section for ${heading}`);
  return within(section)
    .queryAllByRole("link")
    .map((link) => link.textContent ?? "");
}

describe("Pinning a session", () => {
  it("moves it to Pinned at the top of the sidebar, and Unpin puts it back", async () => {
    const { rust, user } = await twoSessions();
    expect(within(sidebar()).queryByRole("heading", { name: "Pinned" })).toBeNull();

    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Fix the build" }));
    await user.click(await shownItem(/^Pin/));

    await waitFor(() => {
      expect(listedUnder("Pinned")).toEqual(["Fix the build"]);
    });
    expect(listedUnder("Playground")).toEqual(["Write the docs"]);
    expect(rust.callsTo("set_session_pinned")).toEqual([{ id: "session-1", pinned: true }]);

    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Fix the build" }));
    await user.click(await shownItem(/Unpin/));

    await waitFor(() => {
      expect(within(sidebar()).queryByRole("heading", { name: "Pinned" })).toBeNull();
    });
    expect(listedUnder("Playground")).toEqual(["Write the docs", "Fix the build"]);
  });

  it("keeps the focus on the row as it moves to the other list", async () => {
    const { user } = await twoSessions({ entry: "/" });
    row("Write the docs").focus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    await focusGoesTo(await shownItem(/Rename/));
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(listedUnder("Pinned")).toEqual(["Write the docs"]);
    });
    await focusGoesTo(row("Write the docs"));
  });

  it("offers Pin session or Unpin session in the command palette, whichever applies", async () => {
    const { user } = await twoSessions();

    await openPalette(user);
    expect(screen.getByRole("option", { name: /Pin session/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Unpin session/ })).toBeNull();
    await user.click(screen.getByRole("option", { name: /Pin session/ }));
    await waitFor(() => {
      expect(listedUnder("Pinned")).toEqual(["Fix the build"]);
    });

    await openPalette(user);
    expect(screen.getByRole("option", { name: /Unpin session/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /^Pin session/ })).toBeNull();
  });

  it("hides a folder project with no sessions left in its list, but never the Playground", async () => {
    startSessionsRust({
      folders: [folderProject("folder-1", "my-app")],
      sessions: [sessionNamed("session-1", "In the folder", "folder-1")],
    });
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByRole("heading", { name: "my-app" });

    await user.click(
      within(await screen.findByRole("complementary", { name: "Sidebar" })).getByRole("button", {
        name: "Actions for In the folder",
      }),
    );
    await user.click(await shownItem(/^Pin/));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "my-app" })).toBeNull();
    });
    expect(listedUnder("Pinned")).toEqual(["In the folder"]);
    expect(within(sidebar()).getByRole("heading", { name: "Playground" })).toBeVisible();
    expect(within(sidebar()).getByText("No sessions yet.")).toBeVisible();
  });

  it("has no accessibility violations with a session pinned", async () => {
    const { user } = await twoSessions();
    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Fix the build" }));
    await user.click(await shownItem(/^Pin/));
    await waitFor(() => {
      expect(listedUnder("Pinned")).toEqual(["Fix the build"]);
    });

    await expectNoAccessibilityViolations(document.body);
  });
});
