import { act, render, screen } from "@testing-library/react";

import type { Turn } from "@/ipc/bindings";

import { ANNOUNCE_INTERVAL_MS } from "./announce";
import { ReplyAnnouncer } from "./ReplyAnnouncer";

function turnWith(text: string, status: Turn["status"] = "running"): Turn {
  return {
    id: "turn-1",
    prompt: "hi",
    startedAt: "2026-09-30T14:05:10Z",
    status,
    items: [
      { type: "thinking", id: "thought", text: "Secret reasoning that is never read aloud." },
      { type: "text", id: "text", text },
    ],
  };
}

const region = () => screen.getByRole("status");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets time pass, and React settle. */
async function wait(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe("Announcing a reply to screen readers", () => {
  it("is a polite live region that says nothing until there is something to say", () => {
    render(<ReplyAnnouncer turn={undefined} />);

    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region()).toHaveTextContent("");
  });

  it("says the complete sentences of a streaming reply, once every few seconds and no more often", async () => {
    const { rerender } = render(<ReplyAnnouncer turn={turnWith("First sentence. Second")} />);

    await wait(ANNOUNCE_INTERVAL_MS - 100);
    expect(region()).toHaveTextContent("");

    await wait(200);
    expect(region()).toHaveTextContent("First sentence.");

    // Words that arrive in between are held until the next time.
    rerender(<ReplyAnnouncer turn={turnWith("First sentence. Second one. Third one.")} />);
    await wait(ANNOUNCE_INTERVAL_MS / 2);
    expect(region()).toHaveTextContent("First sentence.");

    await wait(ANNOUNCE_INTERVAL_MS);
    expect(region()).toHaveTextContent("Second one. Third one.");
    expect(region()).not.toHaveTextContent("First sentence.");
  });

  it("never reads the thinking, and does not repeat what it has already said", async () => {
    const { rerender } = render(<ReplyAnnouncer turn={turnWith("One thing.")} />);
    await wait(ANNOUNCE_INTERVAL_MS + 100);
    expect(region()).toHaveTextContent("One thing.");
    expect(region()).not.toHaveTextContent("Secret reasoning");

    rerender(<ReplyAnnouncer turn={turnWith("One thing. And half of another")} />);
    await wait(ANNOUNCE_INTERVAL_MS * 2);

    expect(region()).toHaveTextContent("One thing.");
  });

  it("says the rest when the reply is over, and that it is over", async () => {
    const { rerender } = render(<ReplyAnnouncer turn={turnWith("First. The last words")} />);
    await wait(ANNOUNCE_INTERVAL_MS + 100);

    rerender(<ReplyAnnouncer turn={turnWith("First. The last words", "done")} />);
    await wait(10);

    expect(region()).toHaveTextContent("The last words Reply finished.");
  });

  it.each([
    ["failed", "Reply failed."],
    ["stopped", "Reply stopped."],
  ] as const)("says when the reply %s", async (status, words) => {
    const { rerender } = render(<ReplyAnnouncer turn={turnWith("Some text.")} />);
    await wait(ANNOUNCE_INTERVAL_MS + 100);

    rerender(<ReplyAnnouncer turn={turnWith("Some text.", status)} />);
    await wait(10);

    expect(region()).toHaveTextContent(words);
  });

  it("says nothing about a session that was opened with its replies already over", async () => {
    render(<ReplyAnnouncer turn={turnWith("Old reply.", "done")} />);

    await wait(ANNOUNCE_INTERVAL_MS * 3);

    expect(region()).toHaveTextContent("");
  });
});
