import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { type AgentKind, commands } from "@/ipc/bindings";
import { sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * Starts a session in the Playground and opens it, with the agent given, or the one a new session
 * takes (ADR 0039). Answers its id, or nothing when it could not be started, which the person is
 * told about with the error's code.
 */
export function useStartSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    async (agent?: AgentKind): Promise<string | undefined> => {
      try {
        const session = await commands.createSession(agent ?? null);
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
