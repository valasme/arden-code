import { useQuery } from "@tanstack/react-query";

import { projectsByUse } from "@/features/sessions/sessionList";
import type { Project } from "@/ipc/bindings";
import { sessionListQuery } from "@/ipc/queries";
import { useSettingsPageStore } from "@/state/settingsPage";

/**
 * The folder projects a plugin can be installed for (ADR 0053): the project of the session the
 * person came from first, then the others, the most recently used first. Never the Playground.
 */
export function useInstallProjects(): Project[] {
  const list = useQuery(sessionListQuery).data;
  const returnTo = useSettingsPageStore((state) => state.returnTo);
  if (!list) return [];
  const openSession = /^\/session\/([^/?#]+)/u.exec(returnTo)?.[1];
  const openProject = [...list.pinned, ...list.projects.flatMap(({ sessions }) => sessions)].find(
    (session) => session.id === openSession,
  )?.projectId;
  const folders = projectsByUse(list).filter((project) => project.kind === "folder");
  return [
    ...folders.filter((project) => project.id === openProject),
    ...folders.filter((project) => project.id !== openProject),
  ];
}
