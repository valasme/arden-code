import type { SessionList, SessionSummary } from "@/ipc/bindings";

/** Every session in the list, whichever part of the sidebar lists it. */
export function allSessions(list: SessionList): SessionSummary[] {
  return list.projects.flatMap((listing) => listing.sessions);
}

/** The session with this id, if the list has it. */
export function findSession(list: SessionList, id: string): SessionSummary | undefined {
  return allSessions(list).find((session) => session.id === id);
}

/** The id of the session whose row in the sidebar has the focus, if one has. */
export function focusedSessionId(): string | undefined {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return undefined;
  return focused.closest<HTMLElement>("[data-session-id]")?.dataset["sessionId"];
}
