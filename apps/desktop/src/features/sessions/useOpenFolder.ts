import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { commands, type Project } from "@/ipc/bindings";
import { sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * Asks for a folder with Windows' dialog and adds it as a project (ADR 0039). Answers the project,
 * or nothing when the person cancelled or it could not be added, which they are told about.
 */
export function useOpenFolder() {
  const queryClient = useQueryClient();

  return useCallback(async (): Promise<Project | undefined> => {
    try {
      const project = await commands.pickFolder();
      if (project === null) return undefined;
      await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
      return project;
    } catch (error) {
      showErrorToast(toAppError(error));
      return undefined;
    }
  }, [queryClient]);
}
