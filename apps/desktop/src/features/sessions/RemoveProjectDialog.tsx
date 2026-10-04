import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands, type Project, type SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useRepliesStore } from "@/state/replies";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { allSessions } from "./sessionList";

/** New session, which the focus goes to once the project and its … button are gone. */
function focusNewSession() {
  document.querySelector<HTMLElement>("[data-new-session]")?.focus();
}

function RemoveQuestion({
  project,
  sessions,
  onClose,
}: {
  project: Project;
  sessions: readonly SessionSummary[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // What had the focus gets it back when nothing is removed: the dialog has no trigger of its own.
  const [returnFocusTo] = useState(() => document.activeElement);
  // Read as the dialog goes away, which happens in the same moment as the click that confirms.
  const confirmed = useRef(false);
  const archived = sessions.filter((session) => session.archivedAt !== null).length;

  const remove = async () => {
    try {
      await commands.removeProject(project.id);
    } catch (error) {
      showErrorToast(toAppError(error));
      return;
    }
    const open = useRepliesStore.getState().sessionId;
    if (sessions.some((session) => session.id === open)) {
      await navigate({ to: "/", replace: true });
    }
    await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
    toast.success(t("projects.remove.done"));
    focusNewSession();
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("projects.remove.title", { name: project.name })}
      description={`${
        archived > 0
          ? t("projects.remove.sessionsArchived", { count: sessions.length, archived })
          : t("projects.remove.sessions", { count: sessions.length })
      } ${t("projects.remove.kept")}`}
      confirmLabel={t("projects.remove.confirm")}
      destructive
      onConfirm={() => {
        confirmed.current = true;
        void remove();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Once the project is removed, the removing says where the focus goes.
        if (confirmed.current) return;
        if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
          returnFocusTo.focus();
        } else {
          focusNewSession();
        }
      }}
    />
  );
}

/**
 * Asks before a folder project is removed with all of its sessions (#72), saying how many go,
 * archived ones included. The focus starts on Cancel, and Esc cancels. Once removed, a session of
 * it that was open gives way to the welcome state, and the focus goes to New session.
 */
export function RemoveProjectDialog() {
  const projectId = useSessionDialogsStore((state) => state.removing);
  const close = useSessionDialogsStore((state) => state.close);
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const project = list.projects.find((listing) => listing.project.id === projectId)?.project;

  if (!project || project.kind === "playground") return null;
  return (
    <RemoveQuestion
      key={project.id}
      project={project}
      sessions={allSessions(list).filter((session) => session.projectId === project.id)}
      onClose={close}
    />
  );
}
