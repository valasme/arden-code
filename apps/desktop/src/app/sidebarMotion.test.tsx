import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { ReduceMotion } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { useSessionDialogsStore } from "@/state/sessionDialogs";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

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

/** How a row is drawn on each frame for `ms`: where it is moved to, how opaque, whether reachable. */
async function framesOf(id: string, ms: number) {
  const frames: { y: number; opacity: number; inert: boolean }[] = [];
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // oxlint-disable-next-line no-await-in-loop -- one look at the row on each frame
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const row = sessionRow(id);
    if (!row) {
      frames.push({ y: 0, opacity: 0, inert: true });
      continue;
    }
    const style = getComputedStyle(row);
    frames.push({
      y: new DOMMatrix(style.transform).m42,
      opacity: Number(style.opacity),
      inert: row.inert,
    });
  }
  return frames;
}

async function twoSessions(reduceMotion: ReduceMotion = "off") {
  startSessionsRust({
    sessions: [
      sessionNamed("session-1", "Fix the build"),
      sessionNamed("session-2", "Write the docs"),
    ],
    reduceMotion,
  });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/session/session-1"] })} />);
  await within(await screen.findByRole("complementary", { name: "Sidebar" })).findByRole("link", {
    name: "Write the docs",
  });
  return user;
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
    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Fix the build" }));
    await user.click(await shownItem(/^Pin/));

    const frames = await framesOf("session-1", 400);

    expect(
      frames.some(({ y }) => y > 1),
      "it starts below, where it was",
    ).toBe(true);
    expect(frames.at(-1)?.y).toBe(0);
  });

  it("fades out of the sidebar, out of reach at once, when its session is archived", async () => {
    const user = await twoSessions();
    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    const frames = await framesOf("session-1", 400);
    const leaving = frames.filter(({ opacity }) => opacity > 0 && opacity < 1);

    expect(leaving.length, "it fades over several frames").toBeGreaterThan(1);
    expect(leaving.every(({ inert }) => inert)).toBe(true);
    expect(sessionRow("session-1")).toBeNull();
  });

  it("moves to its place at once, and leaves at once, with reduced motion", async () => {
    const user = await twoSessions("on");
    await user.click(within(sidebar()).getByRole("button", { name: "Actions for Fix the build" }));
    await user.click(await shownItem(/^Pin/));

    const pinning = await framesOf("session-1", 300);
    expect(pinning.every(({ y }) => y === 0)).toBe(true);

    await user.click(await screen.findByRole("button", { name: "Session actions" }));
    await user.click(await shownItem(/^Archive/));

    const archiving = await framesOf("session-1", 300);
    expect(archiving.every(({ opacity }) => opacity === 0 || opacity === 1)).toBe(true);
  });
});
