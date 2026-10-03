import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { commands, type SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery, sessionQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useRepliesStore } from "@/state/replies";
import { useRowFocusStore } from "@/state/rowFocus";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { findSession } from "./sessionList";

/** What can be done to a session from its menu (ADR 0036). */
export type SessionAction = "rename" | "pin" | "unpin" | "delete";

/** The actions that apply to a session now, in the order its menu lists them. */
export function actionsFor(session: SessionSummary): SessionAction[] {
  return ["rename", session.pinned ? "unpin" : "pin", "delete"];
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
  const askToDelete = useSessionDialogsStore((state) => state.askToDelete);
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
        case "delete": {
          askToDelete({ sessionId, fromRow });
          break;
        }
      }
    },
    [queryClient, rename, askToDelete, focusRow],
  );
}

/** The session whose row in the sidebar comes after this one's, or else before it. */
function neighborOf(sessionId: string): string | undefined {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-area=sidebar] [data-session-id]")];
  const at = rows.findIndex((row) => row.dataset["sessionId"] === sessionId);
  if (at === -1) return undefined;
  return (rows[at + 1] ?? rows[at - 1])?.dataset["sessionId"];
}

/**
 * Deletes a session the person has confirmed deleting (ADR 0036). The open session gives way to the
 * welcome state; a session deleted on its row gives the focus to the next row, or else the one
 * before, or else New session.
 */
export function useDeleteSession(): (sessionId: string, fromRow: boolean) => Promise<void> {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const focusRow = useRowFocusStore((state) => state.focusRow);

  return useCallback(
    async (sessionId, fromRow) => {
      const neighbor = fromRow ? neighborOf(sessionId) : undefined;
      try {
        await commands.deleteSession(sessionId);
      } catch (error) {
        showErrorToast(toAppError(error));
        return;
      }
      // The session view goes before the session's copy, which it would otherwise read again.
      if (useRepliesStore.getState().sessionId === sessionId) {
        await navigate({ to: "/", replace: true });
      }
      queryClient.removeQueries({ queryKey: sessionQuery(sessionId).queryKey });
      await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
      if (fromRow) {
        const list = queryClient.getQueryData(sessionListQuery.queryKey) ?? noSessions;
        const next = neighbor === undefined ? undefined : findSession(list, neighbor);
        if (next) focusRow({ sessionId: next.id, pinned: next.pinned });
        else document.querySelector<HTMLElement>("[data-new-session]")?.focus();
      }
      toast.success(t("sessions.deleted"));
    },
    [t, queryClient, navigate, focusRow],
  );
}
