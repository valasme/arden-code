import type { Item, Turn } from "@/ipc/bindings";

/** An item the agent can ask the person to answer: an approval request, questions or a plan. */
export type Request = Extract<Item, { type: "approval" | "questions" | "plan" }>;

/**
 * Whether the item is an approval request, questions or a plan that wait for the person (ADR 0039,
 * ADR 0044).
 */
export function waitsForAnswer(item: Item): item is Request {
  return (
    (item.type === "approval" || item.type === "questions" || item.type === "plan") &&
    item.state === "waiting"
  );
}

/** The newest request in a running turn that waits for the person, if any. */
export function waitingRequest(turn: Turn | undefined): Request | undefined {
  return turn?.status === "running" ? turn.items.findLast(waitsForAnswer) : undefined;
}
