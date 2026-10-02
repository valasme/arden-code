import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { commands } from "@/ipc/bindings";
import { projectsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * Starts a Demo agent session in the Playground and opens it. Answers its id, or nothing when it
 * could not be started, which the person is told about with the error's code.
 */
export function useStartSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(async (): Promise<string | undefined> => {
    try {
      const session = await commands.createSession();
      await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey });
      await navigate({ to: "/session/$id", params: { id: session.id } });
      return session.id;
    } catch (error) {
      showErrorToast(toAppError(error));
      return undefined;
    }
  }, [navigate, queryClient]);
}
