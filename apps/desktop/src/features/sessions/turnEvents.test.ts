import type { Session, TurnEvent } from "@/ipc/bindings";

import { applyTurnEvent, hasTurn } from "./turnEvents";

const session: Session = {
  id: "session-1",
  projectId: "playground",
  agent: "demo",
  title: "Hello",
  createdAt: "2026-09-30T14:05:09Z",
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

const delta = (text: string): TurnEvent => ({
  type: "textDelta",
  turnId: "turn-2",
  itemId: "turn-2-text",
  text,
});

describe("Applying the events of a reply", () => {
  it("creates the text item with its first piece, and adds the next pieces to it", () => {
    const first = applyTurnEvent(session, delta("Good "));
    const second = applyTurnEvent(first, delta("day "));

    expect(first.turns[0]?.items).toEqual([{ type: "text", id: "turn-2-text", text: "Good " }]);
    expect(second.turns[0]?.items).toEqual([
      { type: "text", id: "turn-2-text", text: "Good day " },
    ]);
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
