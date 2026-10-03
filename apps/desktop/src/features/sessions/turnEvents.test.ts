import type { Item, Session, TurnEvent } from "@/ipc/bindings";

import { applyTurnEvent, hasTurn } from "./turnEvents";

const session: Session = {
  id: "session-1",
  projectId: "playground",
  agent: "demo",
  title: "Hello",
  createdAt: "2026-09-30T14:05:09Z",
  updatedAt: "2026-09-30T14:05:10Z",
  pinned: false,
  archivedAt: null,
  turns: [
    {
      id: "turn-2",
      prompt: "Hello",
      startedAt: "2026-09-30T14:05:10Z",
      status: "running",
      items: [],
    },
  ],
};

const delta = (text: string, itemId = "turn-2-text"): TurnEvent => ({
  type: "textDelta",
  turnId: "turn-2",
  itemId,
  text,
});

const added = (item: Item): TurnEvent => ({ type: "itemAdded", turnId: "turn-2", item });

const toolCall: Item = {
  type: "toolCall",
  id: "call-1",
  name: "read_file",
  input: "README.md",
  status: "running",
  output: null,
};

describe("Applying the events of a reply", () => {
  it("creates the text item with its first piece, and adds the next pieces to it", () => {
    const first = applyTurnEvent(session, delta("Good "));
    const second = applyTurnEvent(first, delta("day "));

    expect(first.turns[0]?.items).toEqual([{ type: "text", id: "turn-2-text", text: "Good " }]);
    expect(second.turns[0]?.items).toEqual([
      { type: "text", id: "turn-2-text", text: "Good day " },
    ]);
  });

  it("adds an item, and replaces one that is added again", () => {
    const first = applyTurnEvent(session, added(toolCall));
    const again = applyTurnEvent(first, added({ ...toolCall, input: "Cargo.toml" }));

    expect(first.turns[0]?.items).toEqual([toolCall]);
    expect(again.turns[0]?.items).toEqual([{ ...toolCall, input: "Cargo.toml" }]);
  });

  it("grows a thinking item with text deltas, and leaves other kinds of item alone", () => {
    const thinking: Item = { type: "thinking", id: "thought", text: "Hm" };
    const start = applyTurnEvent(applyTurnEvent(session, added(thinking)), added(toolCall));

    const grown = applyTurnEvent(
      applyTurnEvent(start, delta("mm.", "thought")),
      delta("x", "call-1"),
    );

    expect(grown.turns[0]?.items).toEqual([{ ...thinking, text: "Hmmm." }, toolCall]);
  });

  it("ends a tool call with its status and what the tool answered", () => {
    const running = applyTurnEvent(session, added(toolCall));

    const done = applyTurnEvent(running, {
      type: "toolCallEnded",
      turnId: "turn-2",
      itemId: "call-1",
      status: "failed",
      output: "not found",
    });

    expect(done.turns[0]?.items).toEqual([{ ...toolCall, status: "failed", output: "not found" }]);
  });

  it("marks the turn done, or failed", () => {
    const done = applyTurnEvent(session, { type: "finished", turnId: "turn-2" });
    const failed = applyTurnEvent(session, { type: "failed", turnId: "turn-2" });

    expect(done.turns[0]?.status).toBe("done");
    expect(failed.turns[0]?.status).toBe("failed");
  });

  it("does not change the session it was given", () => {
    applyTurnEvent(session, delta("x"));

    expect(session.turns[0]?.items).toEqual([]);
  });

  it("changes nothing for a turn the session does not have, and says so", () => {
    const stray: TurnEvent = { type: "finished", turnId: "turn-9" };

    expect(hasTurn(session, stray)).toBe(false);
    expect(hasTurn(session, delta("x"))).toBe(true);
    expect(applyTurnEvent(session, stray)).toEqual(session);
  });
});

describe("Applying the stop of a reply", () => {
  it("ends the turn as stopped, stops a tool that was running, and adds a marker once", () => {
    const running = applyTurnEvent(session, added(toolCall));

    const first = applyTurnEvent(running, { type: "stopped", turnId: "turn-2" });
    const again = applyTurnEvent(first, { type: "stopped", turnId: "turn-2" });

    expect(first.turns[0]?.status).toBe("stopped");
    expect(first.turns[0]?.items).toEqual([
      { ...toolCall, status: "stopped" },
      { type: "status", id: "turn-2-stopped", kind: "stopped" },
    ]);
    expect(again.turns[0]?.items).toHaveLength(2);
  });
});
