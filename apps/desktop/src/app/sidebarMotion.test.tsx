import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { ReduceMotion, Session } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { useSessionDialogsStore } from "@/state/sessionDialogs";
import { animationsDone, motionDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

const sidebar = () => screen.getByRole("complementary", { name: "Sidebar" });

/** A menu item, once its menu has faded in. */
async function shownItem(name: RegExp) {
  const item = await screen.findByRole("menuitem", { name });
  await waitFor(() => {
    expect(item).toBeVisible();
  });
  return item;
}

/** The sidebar row of a session, wherever it is listed, and whether it is still on its way. */
const sessionRow = (id: string) =>
  sidebar().querySelector<HTMLElement>(`li[data-session-id="${id}"]`);

/** How opaque a row is drawn: its own opacity, times its section's as that fades with it. */
function drawnOpacity(row: HTMLElement) {
  let opacity = 1;
  for (let at: HTMLElement | null = row; at && at !== sidebar(); at = at.parentElement) {
    opacity *= Number(getComputedStyle(at).opacity);
  }
  return opacity;
}

/** Where a row is moved to from its place in the list, in pixels down. */
const offset = (row: HTMLElement) => new DOMMatrix(getComputedStyle(row).transform).m42;

/** A row that has left the sidebar. */
const gone = (row: HTMLElement | null) => row === null;

/** A row at rest under Pinned. */
const restingInPinned = (row: HTMLElement | null) =>
  row !== null &&
  offset(row) === 0 &&
  within(sidebar()).queryByRole("region", { name: "Pinned" })?.contains(row) === true;

/**
 * How a row is drawn on each frame until it has `arrived`: where it is moved to, how opaque, and
 * whether it, or the section it leaves with, is out of reach and out of what a screen reader reads.
 * A session's action lands some frames after its menu item is clicked, later when the machine is
 * busy, so the frames run until then, for 3s at most.
 */
async function framesOf(id: string, arrived: (row: HTMLElement | null) => boolean) {
  const frames: { y: number; opacity: number; inert: boolean; hidden: boolean }[] = [];
  const end = performance.now() + 3000;
  while (performance.now() < end) {
    // oxlint-disable-next-line no-await-in-loop -- one look at the row on each frame
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const row = sessionRow(id);
    if (row) {
      frames.push({
        y: offset(row),
        opacity: drawnOpacity(row),
        inert: row.closest("[inert]") !== null,
        hidden: row.closest("[aria-hidden=true]") !== null,
      });
    }
    if (arrived(row)) break;
  }
  return frames;
}

/**
 * A row fading out rather than going at once, out of reach and unread while it fades, and gone at
 * the end. On a busy machine, as few as one frame may be drawn during the 120ms fade.
 */
function expectFadedOut(frames: Awaited<ReturnType<typeof framesOf>>, id: string) {
  const leaving = frames.filter(({ opacity }) => opacity > 0 && opacity < 1);
  expect(leaving.length, "it fades").toBeGreaterThan(0);
  expect(leaving.every(({ inert, hidden }) => inert && hidden)).toBe(true);
  expect(sessionRow(id)).toBeNull();
}

async function showSidebar(sessions: Session[], reduceMotion: ReduceMotion = "off") {
  startSessionsRust({ folders: [folderProject("folder-1", "my-app")], sessions, reduceMotion });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/session/session-1"] })} />);
  await within(await screen.findByRole("complementary", { name: "Sidebar" })).findByRole("link", {
    name: sessions.at(-1)?.title ?? "",
  });
  return user;
}

const twoSessions = (reduceMotion: ReduceMotion = "off") =>
  showSidebar(
    [sessionNamed("session-1", "Fix the build"), sessionNamed("session-2", "Write the docs")],
    reduceMotion,
  );

/** Runs one of a session's actions from its row's … button. */
async function actOn(user: ReturnType<typeof userEvent.setup>, title: string, action: RegExp) {
  await user.click(within(sidebar()).getByRole("button", { name: `Actions for ${title}` }));
  await user.click(await shownItem(action));
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
  useSessionDialogsStore.setState(useSessionDialogsStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
  document.documentElement.removeAttribute("data-motion");
});

describe("A sidebar row", () => {
  it("moves up to Pinned from where it was when its session is pinned", async () => {
    const user = await twoSessions();
    await actOn(user, "Fix the build", /^Pin/);

    const frames = await framesOf("session-1", restingInPinned);

    expect(
      frames.some(({ y }) => y > 1),
      "it starts below, where it was",
    ).toBe(true);
    expect(frames.at(-1)?.y).toBe(0);
    await motionDone(sidebar());
    await expectNoAccessibilityViolations(document.body);
  });

  it("fades out of the sidebar, out of reach at once, when its session is archived", async () => {
    const user = await twoSessions();
    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    expectFadedOut(await framesOf("session-1", gone), "session-1");
  });

  it("fades out of the Playground before the Playground says it has no sessions", async () => {
    const user = await showSidebar([sessionNamed("session-1", "Fix the build")]);
    await actOn(user, "Fix the build", /^Archive/);

    expectFadedOut(await framesOf("session-1", gone), "session-1");
    expect(within(sidebar()).getByText("No sessions yet.")).toBeVisible();
  });

  it("fades out with its project's name when it was the project's last session", async () => {
    const user = await showSidebar([
      sessionNamed("session-1", "Fix the build"),
      sessionNamed("session-2", "In the folder", "folder-1"),
    ]);
    await actOn(user, "In the folder", /^Archive/);

    expectFadedOut(await framesOf("session-2", gone), "session-2");
    expect(within(sidebar()).queryByRole("heading", { name: "my-app" })).toBeNull();
  });

  it("fades out with Pinned's name when it was the last pinned session", async () => {
    const user = await twoSessions();
    await actOn(user, "Write the docs", /^Pin/);
    await within(sidebar()).findByRole("heading", { name: "Pinned" });
    await motionDone(sidebar());
    await actOn(user, "Write the docs", /^Archive/);

    expectFadedOut(await framesOf("session-2", gone), "session-2");
    expect(within(sidebar()).queryByRole("heading", { name: "Pinned" })).toBeNull();
  });

  it("fades out with its project when the project is removed", async () => {
    const user = await showSidebar([
      sessionNamed("session-1", "Fix the build"),
      sessionNamed("session-2", "In the folder", "folder-1"),
    ]);
    await user.click(within(sidebar()).getByRole("button", { name: "Actions for my-app" }));
    await user.click(await shownItem(/^Remove project/));
    const question = await screen.findByRole("alertdialog", { name: "Remove “my-app”?" });
    await animationsDone(question);
    await user.click(within(question).getByRole("button", { name: "Remove project" }));

    expectFadedOut(await framesOf("session-2", gone), "session-2");
  });

  it("moves to its place at once, and leaves at once, with reduced motion", async () => {
    const user = await twoSessions("on");
    await actOn(user, "Fix the build", /^Pin/);

    const pinning = await framesOf("session-1", restingInPinned);
    expect(pinning.every(({ y }) => y === 0)).toBe(true);
    expect(
      within(sidebar()).getByRole("heading", { name: "Pinned" }),
      "pinned by now",
    ).toBeVisible();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    const archiving = await framesOf("session-1", gone);
    expect(archiving.every(({ opacity }) => opacity === 0 || opacity === 1)).toBe(true);
    expect(sessionRow("session-1"), "archived by now").toBeNull();
  });
});

/**
 * The animations on the page on each frame for 200ms that last 1ms or more, a spinner aside. With
 * reduced motion, CSS still runs each change as a 0.01ms transition (base.css), over by the next
 * frame or so.
 */
async function lastingAnimations() {
  const lasting = new Set<string>();
  const end = performance.now() + 200;
  while (performance.now() < end) {
    // oxlint-disable-next-line no-await-in-loop -- one look at the page on each frame
    await new Promise((resolve) => requestAnimationFrame(resolve));
    for (const animation of document.getAnimations()) {
      const name = animation instanceof CSSAnimation ? animation.animationName : animation.id;
      const ms = Number(animation.effect?.getComputedTiming().duration);
      if (name !== "spin" && ms >= 1) lasting.add(`${name || "unnamed"} ${ms}ms`);
    }
  }
  return [...lasting];
}

describe("With reduced motion", () => {
  it("nothing but a spinner moves as an overlay opens, a row moves and a disclosure opens", async () => {
    const user = await showSidebar(
      [
        {
          ...sessionNamed("session-1", "Fix the build"),
          turns: [
            {
              id: "turn-1",
              prompt: "Fix the build",
              startedAt: "2026-10-03T09:00:00Z",
              status: "done",
              items: [{ type: "thinking", id: "turn-1-thinking", text: "First I will read it." }],
            },
          ],
        },
        sessionNamed("session-2", "Write the docs"),
      ],
      "on",
    );

    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Write the docs" }));
    expect(await lastingAnimations(), "an overlay").toEqual([]);

    await user.click(await shownItem(/^Pin/));
    expect(await lastingAnimations(), "a row").toEqual([]);

    await user.click(await screen.findByText("Thinking"));
    expect(await lastingAnimations(), "a disclosure").toEqual([]);
  });
});
