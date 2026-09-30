import { createMemoryHistory } from "@tanstack/react-router";
import type { Channel } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { z } from "zod";

import type { Session, TurnEvent } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { settingsWith } from "@/test/settings";

import { App } from "./App";

import "@/styles/global.css";

/** A session that already has `count` finished turns, as one that has been used for a long time. */
function longSession(count: number): Session {
  return {
    id: "session-1",
    projectId: "playground",
    agent: "demo",
    title: "A long session",
    createdAt: "2026-09-30T14:05:09Z",
    turns: Array.from({ length: count }, (_, index) => ({
      id: `turn-${index + 1}`,
      prompt: `Message number ${index + 1}`,
      startedAt: "2026-09-30T14:05:10Z",
      status: "done",
      items: [
        {
          type: "text",
          id: `text-${index + 1}`,
          text: `Reply number ${index + 1}. It is a short answer with **bold** text.`,
        },
      ],
    })),
  };
}

function startRust(session: Session) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  let channel: Channel<TurnEvent> | undefined;
  mockIPC(
    (command, payload) => {
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "get_settings") return settingsWith();
      if (command === "list_projects") return [];
      if (command === "get_session") return structuredClone(session);
      if (command === "send_message") {
        const { text, onEvent } = z
          .object({ text: z.string(), onEvent: z.custom<Channel<TurnEvent>>() })
          .parse(payload);
        channel = onEvent;
        session.turns.push({
          id: `turn-${session.turns.length + 1}`,
          prompt: text,
          startedAt: "2026-09-30T14:05:10Z",
          status: "running",
          items: [],
        });
        return structuredClone(session);
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return {
    emit(event: TurnEvent) {
      channel?.onmessage(event);
    },
  };
}

const paragraph = (number: number): TurnEvent => ({
  type: "textDelta",
  turnId: "turn-301",
  itemId: "turn-301-text",
  text: `Paragraph ${number} of a long reply that goes on and on.\n\n`,
});

const transcript = () => screen.getByRole("main", { name: "Conversation" });
const rows = () => transcript().querySelectorAll("article");
const jump = () => screen.queryByRole("button", { name: "Jump to latest" });
const distanceFromEnd = () => {
  const element = transcript();
  return element.scrollHeight - element.scrollTop - element.clientHeight;
};

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

function openLongSession(count: number) {
  const rust = startRust(longSession(count));
  render(<App history={createMemoryHistory({ initialEntries: ["/session/session-1"] })} />);
  return rust;
}

describe("A long session", () => {
  it("draws only the messages that are on the screen, and opens at the end", async () => {
    openLongSession(2000);

    expect(await screen.findByText("Message number 2000")).toBeVisible();

    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(40);
    expect(rows()[0]).toHaveAttribute("aria-setsize", "2000");
    expect(jump()).toBeNull();
  });

  it("shows Jump to latest once you scroll up, and brings you back to the end with it", async () => {
    const user = userEvent.setup();
    openLongSession(2000);
    await screen.findByText("Message number 2000");

    transcript().scrollTop = 0;

    const button = await screen.findByRole("button", { name: "Jump to latest" });
    expect(await screen.findByText("Message number 1")).toBeVisible();
    await user.click(button);

    expect(await screen.findByText("Message number 2000")).toBeVisible();
    await waitFor(() => {
      expect(jump()).toBeNull();
    });
  });

  it("keeps the end in view while a reply streams, and leaves you where you are once you scroll up", async () => {
    const user = userEvent.setup();
    const rust = openLongSession(300);
    await screen.findByText("Message number 300");
    await user.click(screen.getByRole("textbox", { name: "Message" }));
    await user.keyboard("Tell me a lot{Enter}");
    await screen.findByText("The Demo agent is replying…");

    for (let number = 1; number <= 40; number += 1) rust.emit(paragraph(number));

    expect(await screen.findByText(/Paragraph 40 of a long reply/)).toBeVisible();
    await waitFor(() => {
      expect(distanceFromEnd()).toBeLessThan(90);
    });

    transcript().scrollTop -= 3000;
    await screen.findByRole("button", { name: "Jump to latest" });
    // Messages that were just drawn are measured, which can move the view a little. Let that settle.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const before = transcript().scrollTop;
    for (let number = 41; number <= 60; number += 1) rust.emit(paragraph(number));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(Math.abs(transcript().scrollTop - before)).toBeLessThan(4);
    expect(jump()).not.toBeNull();
  });
});

/** The p-th value (0 to 1) of a list of numbers. */
function percentile(values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

/** Scrolls from the top to the end in steps, one per frame, and returns how long each frame took. */
async function scrollThrough(element: HTMLElement, steps: number): Promise<number[]> {
  const durations: number[] = [];
  const distance = Math.max(1, (element.scrollHeight - element.clientHeight) / steps);
  let last = performance.now();
  for (let step = 0; step < steps; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each frame follows the one before
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        element.scrollTop += distance;
        resolve();
      });
    });
    const now = performance.now();
    durations.push(now - last);
    last = now;
  }
  return durations;
}

describe("Benchmark: a session of 10,000 messages", () => {
  it("opens quickly, draws only a screenful, and scrolls without dropping many frames", async ({
    annotate,
  }) => {
    const started = performance.now();
    openLongSession(10_000);
    expect(await screen.findByText("Message number 10000", {}, { timeout: 15_000 })).toBeVisible();
    const opened = performance.now() - started;
    const drawn = rows().length;
    expect(drawn).toBeLessThan(60);

    transcript().scrollTop = 0;
    await screen.findByText("Message number 1");
    const frames = await act(() => scrollThrough(transcript(), 200));

    const p50 = percentile(frames, 0.5);
    const p95 = percentile(frames, 0.95);
    const slow = frames.filter((duration) => duration > 100).length;
    // The numbers are printed so a slow run can be compared with a fast one.
    await annotate(
      `10,000 messages: opened in ${Math.round(opened)} ms, ${drawn} drawn, frames p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ${slow} slower than 100 ms`,
    );
    // Generous limits, so that a slow machine does not fail: a version that draws every message
    // takes many seconds to open and makes every frame slower than these.
    expect(opened).toBeLessThan(10_000);
    // The typical frame is judged, not the worst: other tests run beside this one and now and then
    // steal a few frames.
    expect(p50).toBeLessThan(40);
    expect(slow).toBeLessThan(frames.length * 0.1);
    expect(rows().length).toBeLessThan(60);
  }, 60_000);
});
