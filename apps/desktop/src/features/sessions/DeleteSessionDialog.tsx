import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { findSession } from "./sessionList";
import { useDeleteSession } from "./useSessionActions";

function DeleteQuestion({
  sessionId,
  title,
  fromRow,
  onClose,
}: {
  sessionId: string;
  title: string;
  fromRow: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteSession = useDeleteSession();
  // What had the focus gets it back when nothing is deleted: the dialog has no trigger of its own.
  const [returnFocusTo] = useState(() => document.activeElement);
  // Read as the dialog goes away, which happens in the same moment as the click that confirms.
  const confirmed = useRef(false);

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("sessions.delete.title")}
      description={t("sessions.delete.description", { title })}
      confirmLabel={t("sessions.delete.confirm")}
      destructive
      onConfirm={() => {
        confirmed.current = true;
        void deleteSession(sessionId, fromRow);
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Once the session is deleted, the deleting says where the focus goes.
        if (confirmed.current) return;
        if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
          returnFocusTo.focus();
        }
      }}
    />
  );
}

/**
 * Asks before a session is deleted for good (ADR 0036). The focus starts on Cancel, and Esc
 * cancels.
 */
export function DeleteSessionDialog() {
  const { t } = useTranslation();
  const deleting = useSessionDialogsStore((state) => state.deleting);
  const close = useSessionDialogsStore((state) => state.close);
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const session = deleting === undefined ? undefined : findSession(list, deleting.sessionId);

  if (!session || !deleting) return null;
  return (
    <DeleteQuestion
      key={session.id}
      sessionId={session.id}
      title={session.title ?? t("sessions.untitled")}
      fromRow={deleting.fromRow}
      onClose={close}
    />
  );
}
