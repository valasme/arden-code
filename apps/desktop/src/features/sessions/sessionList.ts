import type { Project, SessionList, SessionSummary } from "@/ipc/bindings";

/** Every session in the list, whichever part of the sidebar lists it. */
export function allSessions(list: SessionList): SessionSummary[] {
  return [
    ...list.pinned,
    ...list.projects.flatMap((listing) => listing.sessions),
    ...list.archived,
  ];
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

/**
 * Every project, as the project menu lists them (councils Q2): the Playground first, then the
 * folders whose sessions were used last, then folders with none, in the order they were opened.
 */
export function projectsByUse(list: SessionList): Project[] {
  const latest = new Map<string, string>();
  for (const session of allSessions(list)) {
    const known = latest.get(session.projectId);
    if (known === undefined || session.updatedAt > known) {
      latest.set(session.projectId, session.updatedAt);
    }
  }
  const projects = list.projects.map(({ project }) => project);
  const lastUsed = (project: Project) => latest.get(project.id) ?? "";
  return [
    ...projects.filter((project) => project.kind === "playground"),
    ...projects
      .filter((project) => project.kind !== "playground")
      .toSorted((a, b) => lastUsed(b).localeCompare(lastUsed(a))),
  ];
}
