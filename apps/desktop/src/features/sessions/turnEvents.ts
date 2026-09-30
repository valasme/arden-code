import type { Session, TurnEvent } from "@/ipc/bindings";

/** Whether the session has the turn an event is about. */
export function hasTurn(session: Session, event: TurnEvent): boolean {
  return session.turns.some((turn) => turn.id === event.turnId);
}

/** The session after one event of a reply. Events about turns it does not have change nothing. */
export function applyTurnEvent(session: Session, event: TurnEvent): Session {
  return {
    ...session,
    turns: session.turns.map((turn) => {
      if (turn.id !== event.turnId) return turn;
      if (event.type === "textDelta") {
        const known = turn.items.some((item) => item.id === event.itemId);
        return {
          ...turn,
          items: known
            ? turn.items.map((item) =>
                item.id === event.itemId ? { ...item, text: item.text + event.text } : item,
              )
            : [...turn.items, { type: "text", id: event.itemId, text: event.text }],
        };
      }
      return { ...turn, status: event.type === "finished" ? "done" : "failed" };
    }),
  };
}
