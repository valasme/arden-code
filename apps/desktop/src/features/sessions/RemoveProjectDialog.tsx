import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useRepliesStore } from "@/state/replies";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { allSessions } from "./sessionList";

/**
 * Asks before a folder project is removed with all of its sessions (#72), saying how many go,
 * archived ones included. The focus starts on Cancel, and Esc cancels. Once removed, a session of
 * it that was open gives way to the welcome state.
 */
export function RemoveProjectDialog() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projectId = useSessionDialogsStore((state) => state.removing);
  const close = useSessionDialogsStore((state) => state.close);
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const project = list.projects.find((listing) => listing.project.id === projectId)?.project;

  if (!project || project.kind === "playground") return null;
  const sessions = allSessions(list).filter((session) => session.projectId === project.id);
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
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
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
        void remove();
      }}
    />
  );
}
