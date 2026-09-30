import type { Item, Session, Turn, TurnEvent } from "@/ipc/bindings";

/** Whether the session has the turn an event is about. */
export function hasTurn(session: Session, event: TurnEvent): boolean {
  return session.turns.some((turn) => turn.id === event.turnId);
}

function withDelta(item: Item, itemId: string, text: string): Item {
  if (item.id !== itemId) return item;
  return item.type === "text" || item.type === "thinking"
    ? { ...item, text: item.text + text }
    : item;
}

function applyToTurn(turn: Turn, event: TurnEvent): Turn {
  switch (event.type) {
    case "itemAdded": {
      const known = turn.items.some((item) => item.id === event.item.id);
      return {
        ...turn,
        items: known
          ? turn.items.map((item) => (item.id === event.item.id ? event.item : item))
          : [...turn.items, event.item],
      };
    }
    case "textDelta": {
      const known = turn.items.some((item) => item.id === event.itemId);
      return {
        ...turn,
        items: known
          ? turn.items.map((item) => withDelta(item, event.itemId, event.text))
          : [...turn.items, { type: "text", id: event.itemId, text: event.text }],
      };
    }
    case "toolCallEnded":
      return {
        ...turn,
        items: turn.items.map((item) =>
          item.type === "toolCall" && item.id === event.itemId
            ? { ...item, status: event.status, output: event.output }
            : item,
        ),
      };
    case "finished":
    case "failed":
      break;
  }
  return { ...turn, status: event.type === "finished" ? "done" : "failed" };
}

/** The session after one event of a reply. Events about turns it does not have change nothing. */
export function applyTurnEvent(session: Session, event: TurnEvent): Session {
  return {
    ...session,
    turns: session.turns.map((turn) =>
      turn.id === event.turnId ? applyToTurn(turn, event) : turn,
    ),
  };
}
