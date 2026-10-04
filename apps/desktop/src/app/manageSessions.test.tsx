import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page, userEvent as realInput } from "vitest/browser";

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
      expect(screen.getByRole("menuitem", { name: /New linked session/ })).toHaveFocus();
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
  const dialog = await screen.findByRole("dialog", { name: "Rename session" });
  // The dialog fades in.
  await animationsDone(dialog);
  return dialog;
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

  it("counts a name's characters as Rust does, so 100 emoji fit and 101 do not", async () => {
    const { rust, user } = await twoSessions();
    const dialog = await renameFromTheMenu(user, "Fix the build");

    await user.paste("🙂".repeat(101));
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText("A name can have at most 100 characters.")).toBeVisible();

    const field = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(field);
    await user.paste("🙂".repeat(100));
    await user.keyboard("{Enter}");

    await noDialog();
    expect(rust.callsTo("rename_session")).toEqual([{ id: "session-1", name: "🙂".repeat(100) }]);
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
    await focusGoesTo(await shownItem(/New linked session/));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await focusGoesTo(screen.getByRole("menuitem", { name: /^Pin/ }));
    await user.keyboard("{Enter}");

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

/** Asks to delete a session from its row's menu. */
async function deleteFromTheMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(sidebar()).getByRole("button", { name: `Actions for ${name}` }));
  await user.click(await shownItem(/Delete/));
  return screen.findByRole("alertdialog", { name: "Delete this session?" });
}

describe("Deleting a session", () => {
  it("asks first, then deletes it for good and goes to the welcome state when it was open", async () => {
    const { rust, user } = await twoSessions();

    const question = await deleteFromTheMenu(user, "Fix the build");
    expect(question).toHaveTextContent(
      "“Fix the build” and all of its messages will be deleted. This cannot be undone.",
    );
    await focusGoesTo(within(question).getByRole("button", { name: "Cancel" }));
    await user.click(within(question).getByRole("button", { name: "Delete session" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "What should the Demo agent work on?" }),
    ).toBeVisible();
    expect(rust.callsTo("delete_session")).toEqual([{ id: "session-1" }]);
    expect(within(sidebar()).queryByRole("link", { name: "Fix the build" })).toBeNull();
    expect(await screen.findByText("Session deleted")).toBeInTheDocument();
  });

  it("deletes nothing when the question is cancelled, or left with Esc", async () => {
    const { rust, user } = await twoSessions();

    const question = await deleteFromTheMenu(user, "Write the docs");
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    await deleteFromTheMenu(user, "Write the docs");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    expect(rust.callsTo("delete_session")).toEqual([]);
    expect(row("Write the docs")).toBeVisible();
  });

  it("asks to delete the session whose row has the focus with the Delete key, then moves the focus to the next row", async () => {
    const { rust, user } = await twoSessions({ entry: "/" });
    row("Write the docs").focus();

    await user.keyboard("{Delete}");
    const question = await screen.findByRole("alertdialog", { name: "Delete this session?" });
    expect(question).toHaveTextContent("“Write the docs”");
    await user.click(within(question).getByRole("button", { name: "Delete session" }));

    await waitFor(() => {
      expect(rust.callsTo("delete_session")).toEqual([{ id: "session-2" }]);
    });
    await focusGoesTo(row("Fix the build"));
  });

  it("moves the focus to the row before when the last row goes, and to New session when none is left", async () => {
    const { user } = await twoSessions({ entry: "/" });
    row("Fix the build").focus();

    await user.keyboard("{Delete}");
    await user.click(await screen.findByRole("button", { name: "Delete session" }));
    await focusGoesTo(row("Write the docs"));

    await user.keyboard("{Delete}");
    await user.click(await screen.findByRole("button", { name: "Delete session" }));
    await focusGoesTo(within(sidebar()).getByRole("button", { name: "New session" }));
    expect(within(sidebar()).getByText("No sessions yet.")).toBeVisible();
  });

  it("leaves no tooltip open on New session when the focus goes back to it after the last delete", async () => {
    await twoSessions({ entry: "/" });
    // Real clicks, through the browser, as the person makes them.
    const deleteWithClicks = async (name: string) => {
      await realInput.click(within(sidebar()).getByRole("button", { name: `Actions for ${name}` }));
      await realInput.click(await shownItem(/Delete/));
      await realInput.click(await screen.findByRole("button", { name: "Delete session" }));
      await noDialog();
    };
    await deleteWithClicks("Fix the build");
    await deleteWithClicks("Write the docs");
    await focusGoesTo(within(sidebar()).getByRole("button", { name: "New session" }));

    // Past the tooltip's delay: one opened by the focus would be showing by now.
    await new Promise((resolve) => {
      setTimeout(resolve, 700);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("leaves the Delete key alone in a text field", async () => {
    const { rust, user } = await twoSessions();
    await user.click(screen.getByRole("textbox", { name: "Message" }));
    await user.keyboard("abc{ArrowLeft}{Delete}");

    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("ab");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rust.callsTo("delete_session")).toEqual([]);
  });

  it("is in the command palette for the open session", async () => {
    const { user } = await twoSessions();

    await openPalette(user);
    await user.click(screen.getByRole("option", { name: /Delete session/ }));

    expect(
      await screen.findByRole("alertdialog", { name: "Delete this session?" }),
    ).toHaveTextContent("“Fix the build”");
  });

  it("has no accessibility violations while it asks", async () => {
    const { user } = await twoSessions();
    await animationsDone(await deleteFromTheMenu(user, "Fix the build"));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** A session that was archived before the page came up. */
const archivedSession = (id: string, title: string) => ({
  ...sessionNamed(id, title),
  archivedAt: "2026-10-01T08:00:00Z",
});

/** Rust with sessions archived first and second, and one that is not archived, opened at `entry`. */
async function archivedSessions(entry: string) {
  const rust = startSessionsRust({
    sessions: [
      archivedSession("session-1", "Old work"),
      archivedSession("session-2", "Older plans"),
      sessionNamed("session-3", "Current work"),
    ],
  });
  const user = userEvent.setup();
  renderApp(entry);
  await screen.findByRole("complementary", { name: "Sidebar" });
  return { rust, user };
}

/** The archived sessions the page lists, by name. */
function archivedOnThePage(): string[] {
  const list = screen.queryByRole("list", { name: "Archived sessions" });
  if (!list) return [];
  return within(list)
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("link").textContent ?? "");
}

/** The names of the items of the menu that is open, without their shortcuts. */
function menuItems(): string[] {
  return screen
    .getAllByRole("menuitem")
    .map((item) => item.textContent?.replace(/F2$|Ctrl\+Shift\+N$/u, "") ?? "");
}

describe("Archiving a session", () => {
  it("puts it away from the sidebar's lists and shows it read-only, with Unarchive in place of the message box", async () => {
    const { rust, user } = await twoSessions();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    expect(await screen.findByText("This session is archived.")).toBeVisible();
    expect(rust.callsTo("set_session_archived")).toEqual([{ id: "session-1", archived: true }]);
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeVisible();
    await waitFor(() => {
      expect(listedUnder("Playground")).toEqual(["Write the docs"]);
    });
    expect(within(sidebar()).getByRole("link", { name: /Archived/ })).toBeVisible();
    expect(await screen.findByText("Session archived")).toBeInTheDocument();
  });

  it("is undone from the notice", async () => {
    const { rust, user } = await twoSessions();
    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(listedUnder("Playground")).toEqual(["Write the docs", "Fix the build"]);
    });
    expect(rust.callsTo("set_session_archived")).toEqual([
      { id: "session-1", archived: true },
      { id: "session-1", archived: false },
    ]);
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeVisible();
  });

  it("brings the message box back with Unarchive, with the focus in it", async () => {
    const { user } = await archivedSessions("/session/session-1");
    expect(await screen.findByText("This session is archived.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Unarchive" }));

    await focusGoesTo(await screen.findByRole("textbox", { name: "Message" }));
    expect(screen.queryByText("This session is archived.")).toBeNull();
  });

  it("offers only New linked session, Unarchive and Delete in an archived session's menu", async () => {
    const { user } = await archivedSessions("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Session actions" }));

    await shownItem(/Unarchive/);
    expect(menuItems()).toEqual(["New linked session", "Unarchive", "Delete…"]);
  });

  it("moves the focus to the next row when it is archived from its row", async () => {
    const { user } = await twoSessions({ entry: "/" });
    row("Write the docs").focus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.click(await shownItem(/^Archive/));

    await waitFor(() => {
      expect(listedUnder("Playground")).toEqual(["Fix the build"]);
    });
    await focusGoesTo(row("Fix the build"));
  });

  it("offers Archive session or Unarchive session in the command palette, whichever applies", async () => {
    const { user } = await twoSessions();

    await openPalette(user);
    expect(screen.queryByRole("option", { name: /Unarchive session/ })).toBeNull();
    await user.click(screen.getByRole("option", { name: /Archive session/ }));
    expect(await screen.findByText("This session is archived.")).toBeVisible();

    await openPalette(user);
    expect(screen.getByRole("option", { name: /Unarchive session/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /^Archive session/ })).toBeNull();
  });
});

describe("The archived sessions page", () => {
  it("lists archived sessions, the last archived first, with their project and the date", async () => {
    const { user } = await archivedSessions("/");

    await user.click(await within(sidebar()).findByRole("link", { name: /Archived/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Archived sessions" }),
    ).toBeVisible();
    expect(archivedOnThePage()).toEqual(["Older plans", "Old work"]);
    const [first] = within(screen.getByRole("list", { name: "Archived sessions" })).getAllByRole(
      "listitem",
    );
    if (!first) throw new Error("no first row");
    expect(first.textContent).toMatch(/Playground · Archived/u);
    expect(within(first).getByRole("button", { name: "Unarchive" })).toBeVisible();
    expect(within(first).getByRole("button", { name: "Delete…" })).toBeVisible();
  });

  it("opens an archived session from the page", async () => {
    const { user } = await archivedSessions("/archived");

    await user.click(await screen.findByRole("link", { name: "Old work" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Old work" })).toBeVisible();
    expect(screen.getByText("This session is archived.")).toBeVisible();
  });

  it("unarchives a session, which goes back to its project, and moves the focus to the next row", async () => {
    const { rust, user } = await archivedSessions("/archived");
    await screen.findByRole("heading", { level: 1, name: "Archived sessions" });
    const [first] = screen.getAllByRole("button", { name: "Unarchive" });
    if (!first) throw new Error("no Unarchive button");

    await user.click(first);

    await waitFor(() => {
      expect(archivedOnThePage()).toEqual(["Old work"]);
    });
    expect(rust.callsTo("set_session_archived")).toEqual([{ id: "session-2", archived: false }]);
    // Back in its project, where it stands by when it was last used.
    expect(listedUnder("Playground")).toEqual(["Current work", "Older plans"]);
    await focusGoesTo(screen.getByRole("button", { name: "Unarchive" }));
  });

  it("deletes a session after asking, says so when none is left, and the sidebar's Archived row goes", async () => {
    const { rust, user } = await archivedSessions("/archived");
    await screen.findByRole("heading", { level: 1, name: "Archived sessions" });

    for (const name of ["Older plans", "Old work"]) {
      const [button] = screen.getAllByRole("button", { name: "Delete…" });
      if (!button) throw new Error("no Delete button");
      // oxlint-disable-next-line no-await-in-loop -- one row after the other
      await user.click(button);
      // oxlint-disable-next-line no-await-in-loop -- one row after the other
      const question = await screen.findByRole("alertdialog", { name: "Delete this session?" });
      expect(question).toHaveTextContent(`“${name}”`);
      // oxlint-disable-next-line no-await-in-loop -- one row after the other
      await user.click(within(question).getByRole("button", { name: "Delete session" }));
      // oxlint-disable-next-line no-await-in-loop -- one row after the other
      await waitFor(() => {
        expect(archivedOnThePage()).not.toContain(name);
      });
    }

    expect(await screen.findByText("No archived sessions.")).toBeVisible();
    expect(rust.callsTo("delete_session")).toEqual([{ id: "session-2" }, { id: "session-1" }]);
    expect(within(sidebar()).queryByRole("link", { name: /Archived/ })).toBeNull();
  });

  it("opens from the command palette", async () => {
    const { user } = await twoSessions();

    await openPalette(user);
    await user.click(screen.getByRole("option", { name: /Archived sessions/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Archived sessions" }),
    ).toBeVisible();
    expect(screen.getByText("No archived sessions.")).toBeVisible();
  });

  it("has no accessibility violations, and neither has an archived session", async () => {
    const { user } = await archivedSessions("/archived");
    await screen.findByRole("list", { name: "Archived sessions" });
    await expectNoAccessibilityViolations(document.body);

    await user.click(screen.getByRole("link", { name: "Old work" }));
    await screen.findByText("This session is archived.");
    await expectNoAccessibilityViolations(document.body);
  });
});

/** The links of the open session to the sessions it is linked with, as their lines read. */
function linkLines(): string[] {
  const links = screen.queryByRole("navigation", { name: "Linked sessions" });
  if (!links) return [];
  return [...links.querySelectorAll("p")].map((line) => line.textContent ?? "");
}

describe("Linked sessions", () => {
  it("starts one from the menu and opens it, and each session shows the link to the other", async () => {
    const { rust, user } = await twoSessions();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/New linked session/));

    expect(await screen.findByRole("heading", { level: 1, name: "New session" })).toBeVisible();
    expect(rust.callsTo("create_linked_session")).toEqual([{ fromId: "session-1" }]);
    expect(linkLines()).toEqual(["Linked from Fix the build"]);
    await focusGoesTo(screen.getByRole("textbox", { name: "Message" }));

    await user.click(
      within(screen.getByRole("navigation", { name: "Linked sessions" })).getByRole("link", {
        name: "Fix the build",
      }),
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Fix the build" })).toBeVisible();
    expect(linkLines()).toEqual(["Linked to New session"]);
  });

  it("starts one from the open session with Ctrl+Shift+N, and from the command palette", async () => {
    const { rust, user } = await twoSessions();

    await user.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");
    await waitFor(() => {
      expect(linkLines()).toEqual(["Linked from Fix the build"]);
    });

    await openPalette(user);
    await user.click(screen.getByRole("option", { name: /New linked session/ }));
    await waitFor(() => {
      expect(rust.callsTo("create_linked_session")).toEqual([
        { fromId: "session-1" },
        { fromId: "session-3" },
      ]);
    });
    await waitFor(() => {
      expect(linkLines()).toEqual(["Linked from New session"]);
    });
  });

  it("starts one from an archived session, which is how old work carries on", async () => {
    const { rust, user } = await archivedSessions("/session/session-1");

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/New linked session/));

    expect(await screen.findByRole("textbox", { name: "Message" })).toBeVisible();
    expect(rust.callsTo("create_linked_session")).toEqual([{ fromId: "session-1" }]);
    expect(linkLines()).toEqual(["Linked from Old work"]);
  });

  it("drops the link when the session it points to is deleted", async () => {
    const { user } = await twoSessions();
    await user.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");
    await waitFor(() => {
      expect(linkLines()).toEqual(["Linked from Fix the build"]);
    });

    await deleteFromTheMenu(user, "Fix the build");
    await user.click(await screen.findByRole("button", { name: "Delete session" }));

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: "Linked sessions" })).toBeNull();
    });
  });

  it("has no accessibility violations with the links shown", async () => {
    const { user } = await twoSessions();
    await user.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");
    await waitFor(() => {
      expect(linkLines()).toEqual(["Linked from Fix the build"]);
    });

    await expectNoAccessibilityViolations(document.body);
  });
});
