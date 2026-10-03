import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { commands, type SessionSummary } from "@/ipc/bindings";
import { sessionListQuery, sessionQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useRowFocusStore } from "@/state/rowFocus";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

/** What can be done to a session from its menu (ADR 0036). */
export type SessionAction = "rename" | "pin" | "unpin";

/** The actions that apply to a session now, in the order its menu lists them. */
export function actionsFor(session: SessionSummary): SessionAction[] {
  return ["rename", session.pinned ? "unpin" : "pin"];
}

/**
 * Runs an action of a session's menu on a session. `fromRow` says it was chosen on the session's row
 * in the sidebar, which keeps the focus when the action moves it.
 */
export function useSessionActions(): (
  action: SessionAction,
  sessionId: string,
  fromRow?: boolean,
) => void {
  const queryClient = useQueryClient();
  const rename = useSessionDialogsStore((state) => state.rename);
  const focusRow = useRowFocusStore((state) => state.focusRow);

  return useCallback(
    (action, sessionId, fromRow = false) => {
      const setPinned = async (pinned: boolean) => {
        await commands.setSessionPinned(sessionId, pinned);
        // The session's own copy changes in place: reading it again could repeat a reply that is
        // still streaming (ADR 0016).
        queryClient.setQueryData(
          sessionQuery(sessionId).queryKey,
          (session) => session && { ...session, pinned },
        );
        await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
        if (fromRow) focusRow({ sessionId, pinned });
      };

      switch (action) {
        case "rename": {
          rename(sessionId);
          break;
        }
        case "pin":
        case "unpin": {
          setPinned(action === "pin").catch((error: unknown) => {
            showErrorToast(toAppError(error));
          });
          break;
        }
      }
    },
    [queryClient, rename, focusRow],
  );
}
