import { type QueryClient, useQueryClient } from "@tanstack/react-query";
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
export type SessionAction = "rename" | "pin" | "unpin" | "archive" | "unarchive" | "delete";

/**
 * The actions that apply to a session now, in the order its menu lists them. An archived session
 * can only be unarchived or deleted.
 */
export function actionsFor(session: SessionSummary): SessionAction[] {
  if (session.archivedAt !== null) return ["unarchive", "delete"];
  return ["rename", session.pinned ? "unpin" : "pin", "archive", "delete"];
}

/** The session whose row in the sidebar comes after this one's, or else before it. */
function neighborOf(sessionId: string): string | undefined {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-area=sidebar] [data-session-id]")];
  const at = rows.findIndex((row) => row.dataset["sessionId"] === sessionId);
  if (at === -1) return undefined;
  return (rows[at + 1] ?? rows[at - 1])?.dataset["sessionId"];
}

type FocusRow = ReturnType<typeof useRowFocusStore.getState>["focusRow"];

/**
 * Gives the focus to the row that stood next to a row that left the sidebar's lists, once the list
 * has changed, or to New session when there is none (ADR 0036).
 */
function focusNeighbor(queryClient: QueryClient, focusRow: FocusRow, neighbor: string | undefined) {
  const list = queryClient.getQueryData(sessionListQuery.queryKey) ?? noSessions;
  const next = neighbor === undefined ? undefined : findSession(list, neighbor);
  if (next && next.archivedAt === null) focusRow({ sessionId: next.id, pinned: next.pinned });
  else document.querySelector<HTMLElement>("[data-new-session]")?.focus();
}

/**
 * Brings the session's own copy in step with the list Rust gave, in place: reading it again could
 * repeat a reply that is still streaming (ADR 0016).
 */
function updateFromList(queryClient: QueryClient, sessionId: string) {
  const list = queryClient.getQueryData(sessionListQuery.queryKey) ?? noSessions;
  const summary = findSession(list, sessionId);
  if (!summary) return;
  queryClient.setQueryData(
    sessionQuery(sessionId).queryKey,
    (session) => session && { ...session, pinned: summary.pinned, archivedAt: summary.archivedAt },
  );
}

/**
 * Runs an action of a session's menu on a session. `fromRow` says it was chosen on the session's row
 * in the sidebar, which keeps the focus when the action moves the row or takes it away.
 */
export function useSessionActions(): (
  action: SessionAction,
  sessionId: string,
  fromRow?: boolean,
) => void {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const rename = useSessionDialogsStore((state) => state.rename);
  const askToDelete = useSessionDialogsStore((state) => state.askToDelete);
  const focusRow = useRowFocusStore((state) => state.focusRow);

  return useCallback(
    (action, sessionId, fromRow = false) => {
      const failed = (error: unknown) => {
        showErrorToast(toAppError(error));
      };

      const setPinned = async (pinned: boolean) => {
        await commands.setSessionPinned(sessionId, pinned);
        await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
        updateFromList(queryClient, sessionId);
        if (fromRow) focusRow({ sessionId, pinned });
      };

      const setArchived = async (archived: boolean, onRow: boolean) => {
        const neighbor = onRow && archived ? neighborOf(sessionId) : undefined;
        await commands.setSessionArchived(sessionId, archived);
        await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
        updateFromList(queryClient, sessionId);
        if (onRow && archived) focusNeighbor(queryClient, focusRow, neighbor);
        if (archived) {
          // Archiving takes the session out of sight: the notice says where it went, and can undo it.
          toast.success(t("sessions.archived.done"), {
            action: {
              label: t("sessions.archived.undo"),
              onClick: () => {
                setArchived(false, false).catch(failed);
              },
            },
          });
        }
      };

      switch (action) {
        case "rename": {
          rename(sessionId);
          break;
        }
        case "pin":
        case "unpin": {
          setPinned(action === "pin").catch(failed);
          break;
        }
        case "archive":
        case "unarchive": {
          setArchived(action === "archive", fromRow).catch(failed);
          break;
        }
        case "delete": {
          askToDelete({ sessionId, fromRow });
          break;
        }
      }
    },
    [t, queryClient, rename, askToDelete, focusRow],
  );
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
      if (fromRow) focusNeighbor(queryClient, focusRow, neighbor);
      toast.success(t("sessions.deleted"));
    },
    [t, queryClient, navigate, focusRow],
  );
}
