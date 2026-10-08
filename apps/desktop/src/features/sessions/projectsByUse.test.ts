import type { SessionList, SessionSummary } from "@/ipc/bindings";

import { projectsByUse } from "./sessionList";

const project = (id: string, kind: "playground" | "folder" = "folder") => ({
  id,
  kind,
  name: id,
  path: String.raw`C:\Work` + `\\${id}`,
  trusted: true,
});

const used = (id: string, projectId: string, updatedAt: string): SessionSummary => ({
  id,
  projectId,
  agent: "demo",
  title: id,
  createdAt: updatedAt,
  updatedAt,
  pinned: false,
  archivedAt: null,
  linkedFrom: null,
});

describe("projectsByUse", () => {
  it("lists the Playground first, then folders by their latest session, then unused ones", () => {
    const list: SessionList = {
      pinned: [{ ...used("p", "old", "2026-10-04T10:00:00Z"), pinned: true }],
      projects: [
        { project: project("playground", "playground"), sessions: [] },
        { project: project("old"), sessions: [used("o", "old", "2026-09-01T10:00:00Z")] },
        { project: project("unused"), sessions: [] },
        { project: project("recent"), sessions: [used("r", "recent", "2026-10-03T10:00:00Z")] },
      ],
      archived: [],
    };

    expect(projectsByUse(list).map(({ id }) => id)).toEqual([
      "playground",
      "old",
      "recent",
      "unused",
    ]);
  });
});
