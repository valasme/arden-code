import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { commands, type NewSession } from "@/ipc/bindings";
import { sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * Starts a session in a project, the Playground when none is given, and opens it: as `start` says,
 * in one call, or as a new session there starts (ADR 0039, 0041 and 0044). Answers its id, or
 * nothing when it could not be started, which the person is told about with the error's code.
 */
export function useStartSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    async (projectId?: string, start?: NewSession): Promise<string | undefined> => {
      try {
        const session = await commands.createSession(projectId ?? null, start ?? null);
        await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
        await navigate({ to: "/session/$id", params: { id: session.id } });
        return session.id;
      } catch (error) {
        showErrorToast(toAppError(error));
        return undefined;
      }
    },
    [navigate, queryClient],
  );
}
