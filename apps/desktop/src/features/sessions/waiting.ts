import type { Item, Turn } from "@/ipc/bindings";

/** An item the agent can ask the person to answer: an approval request or questions. */
export type Request = Extract<Item, { type: "approval" | "questions" }>;

/** Whether the item is an approval request or questions that wait for the person (ADR 0039). */
export function waitsForAnswer(item: Item): item is Request {
  return (item.type === "approval" || item.type === "questions") && item.state === "waiting";
}

/** The newest request in a running turn that waits for the person, if any. */
export function waitingRequest(turn: Turn | undefined): Request | undefined {
  return turn?.status === "running" ? turn.items.findLast(waitsForAnswer) : undefined;
}
