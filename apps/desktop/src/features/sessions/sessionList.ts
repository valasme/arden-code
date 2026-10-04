import type { Project, SessionList, SessionSummary } from "@/ipc/bindings";
import { matchesSearch } from "@/lib/search";

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

/** A session as the command palette lists it: its name, and the name of its project. */
export interface PaletteSession {
  id: string;
  name: string;
  project: string;
}

/** How many sessions the command palette lists before anything is typed. */
const recentInPalette = 5;

/**
 * The sessions the command palette offers for what has been typed (#71): with nothing typed, the
 * five used last; otherwise every session whose name or project matches, the most recently used
 * first, with the archived ones apart and only then. An untitled session goes by `untitled`, the
 * name the sidebar gives it.
 */
export function paletteSessions(
  list: SessionList,
  query: string,
  untitled: string,
): { recent: PaletteSession[]; archived: PaletteSession[] } {
  const projects = new Map(list.projects.map(({ project }) => [project.id, project.name]));
  const entries = (sessions: readonly SessionSummary[]) =>
    sessions
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((session) => ({
        id: session.id,
        name: session.title ?? untitled,
        project: projects.get(session.projectId) ?? "",
      }));
  const current = entries([...list.pinned, ...list.projects.flatMap(({ sessions }) => sessions)]);
  if (query.trim() === "") return { recent: current.slice(0, recentInPalette), archived: [] };
  const matching = (session: PaletteSession) =>
    matchesSearch({ label: session.name, description: session.project }, query);
  return { recent: current.filter(matching), archived: entries(list.archived).filter(matching) };
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

/** The project of the session used last, archived ones aside, if there is one. */
export function latestProjectId(list: SessionList): string | undefined {
  const current = [...list.pinned, ...list.projects.flatMap(({ sessions }) => sessions)];
  return current.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.projectId;
}
