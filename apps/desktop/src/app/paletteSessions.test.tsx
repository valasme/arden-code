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

/** A session last used on a day in October 2026. */
const usedOn = (id: string, title: string | null, day: number, project = "playground") => ({
  ...sessionNamed(id, title, project),
  updatedAt: `2026-10-0${day}T10:00:00Z`,
});

/** Seven sessions, used a day apart, the last one archived. */
function sessions() {
  return [
    usedOn("s1", "Old idea", 1),
    usedOn("s2", "Write the docs", 2, "work"),
    usedOn("s3", null, 3),
    usedOn("s4", "Try a prompt", 4),
    usedOn("s5", "Plan the release", 5, "work"),
    usedOn("s6", "Fix login", 6, "work"),
    { ...usedOn("s7", "Archived login fix", 7, "work"), archivedAt },
  ];
}

async function openPalette() {
  startSessionsRust({ sessions: sessions(), folders: [work] });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
  await screen.findByRole("complementary", { name: "Sidebar" });
  await screen.findByRole("link", { name: "Fix login" });
  await user.keyboard("{Control>}k{/Control}");
  const palette = await screen.findByRole("dialog", { name: "Command palette" });
  await animationsDone(palette);
  return { palette, user };
}

const optionNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent);

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Sessions in the command palette", () => {
  it("lists the five sessions used last after the commands, before anything is typed", async () => {
    const { palette } = await openPalette();

    const groups = within(palette).getAllByRole("group");
    const sessionsGroup = within(palette).getByRole("group", { name: "Sessions" });
    expect(groups.at(-1)).toBe(sessionsGroup);
    expect(optionNames(sessionsGroup)).toEqual([
      "Fix login, in arden-code",
      "Plan the release, in arden-code",
      "Try a prompt, in Playground",
      "New session, in Playground",
      "Write the docs, in arden-code",
    ]);
    expect(within(palette).queryByRole("group", { name: "Archived" })).toBeNull();
  });

  it("finds sessions by name or project while typing, with matching archived ones apart", async () => {
    const { palette, user } = await openPalette();

    await user.keyboard("login");

    await waitFor(() => {
      expect(optionNames(within(palette).getByRole("group", { name: "Sessions" }))).toEqual([
        "Fix login, in arden-code",
      ]);
    });
    expect(optionNames(within(palette).getByRole("group", { name: "Archived" }))).toEqual([
      "Archived login fix, in arden-code",
    ]);
  });

  it("opens the chosen session and closes", async () => {
    const { palette, user } = await openPalette();

    await user.click(
      within(palette).getByRole("option", { name: "Plan the release, in arden-code" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Plan the release" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    });
  });

  it("opens an archived session read-only", async () => {
    const { palette, user } = await openPalette();
    await user.keyboard("archived");

    await user.click(
      await within(palette).findByRole("option", { name: "Archived login fix, in arden-code" }),
    );

    expect(await screen.findByText("This session is archived.")).toBeVisible();
  });

  it("still finds commands as before, above the sessions", async () => {
    const { palette, user } = await openPalette();

    await user.keyboard("settings");

    const [first] = within(palette).getAllByRole("option");
    expect(first).toHaveTextContent("Settings");
  });

  it("has no accessibility violations", async () => {
    const { palette, user } = await openPalette();
    await user.keyboard("login");
    await within(palette).findByRole("group", { name: "Archived" });

    await expectNoAccessibilityViolations(document.body);
  });
});
