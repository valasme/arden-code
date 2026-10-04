import type { SessionList, SessionSummary } from "@/ipc/bindings";

import { paletteSessions } from "./sessionList";

const playground = {
  id: "playground",
  kind: "playground",
  name: "Playground",
  path: String.raw`C:\Playground`,
  trusted: true,
} as const;
const arden = {
  id: "arden",
  kind: "folder",
  name: "arden-code",
  path: String.raw`C:\Work\arden-code`,
  trusted: true,
} as const;

function summary(
  id: string,
  title: string | null,
  updatedAt: string,
  projectId = "playground",
): SessionSummary {
  return {
    id,
    projectId,
    agent: "demo",
    title,
    createdAt: updatedAt,
    updatedAt,
    pinned: false,
    archivedAt: null,
    linkedFrom: null,
  };
}

const list: SessionList = {
  pinned: [{ ...summary("pinned", "Pinned plan", "2026-10-01T10:00:00Z"), pinned: true }],
  projects: [
    {
      project: playground,
      sessions: [
        summary("p2", "Try a prompt", "2026-10-03T10:00:00Z"),
        summary("p1", null, "2026-09-30T10:00:00Z"),
      ],
    },
    {
      project: arden,
      sessions: [
        summary("a3", "Fix login", "2026-10-04T10:00:00Z", "arden"),
        summary("a2", "Write docs", "2026-10-02T10:00:00Z", "arden"),
        summary("a1", "Old idea", "2026-09-29T10:00:00Z", "arden"),
      ],
    },
  ],
  archived: [
    {
      ...summary("x1", "Archived login fix", "2026-09-28T10:00:00Z", "arden"),
      archivedAt: "2026-10-01T09:00:00Z",
    },
  ],
};

const ids = (sessions: readonly { id: string }[]) => sessions.map((session) => session.id);

describe("paletteSessions", () => {
  it("lists the five sessions used last when nothing is typed, pinned ones too, and no archived one", () => {
    const found = paletteSessions(list, "", "New session");

    expect(ids(found.recent)).toEqual(["a3", "p2", "a2", "pinned", "p1"]);
    expect(found.archived).toEqual([]);
  });

  it("finds sessions by their name or their project's name, most recently used first", () => {
    expect(ids(paletteSessions(list, "login", "New session").recent)).toEqual(["a3"]);
    expect(ids(paletteSessions(list, "arden", "New session").recent)).toEqual(["a3", "a2", "a1"]);
  });

  it("finds an untitled session by the name the sidebar gives it", () => {
    expect(ids(paletteSessions(list, "new sess", "New session").recent)).toEqual(["p1"]);
  });

  it("lists matching archived sessions apart, only while something is typed", () => {
    const found = paletteSessions(list, "login", "New session");

    expect(ids(found.archived)).toEqual(["x1"]);
  });

  it("names each session and its project", () => {
    const [first] = paletteSessions(list, "", "New session").recent;

    expect(first).toEqual({ id: "a3", name: "Fix login", project: "arden-code" });
  });
});
