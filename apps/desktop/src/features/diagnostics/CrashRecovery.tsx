import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/ipc/bindings";
import { pendingCrashesQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * After a crash, the next start offers to export diagnostics. It asks once per crash: whatever the
 * person answers, the reports are marked as seen (they stay on disk and go into any bundle).
 */
export function CrashRecovery() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: crashes } = useQuery({ ...pendingCrashesQuery, enabled: isTauri() });
  const [answered, setAnswered] = useState(false);

  const open = !answered && (crashes?.length ?? 0) > 0;

  const acknowledge = () => {
    setAnswered(true);
    commands
      .acknowledgeCrashes()
      .then(() => queryClient.invalidateQueries({ queryKey: pendingCrashesQuery.queryKey }))
      .catch(() => {});
  };

  const exportDiagnostics = () => {
    acknowledge();
    commands
      .exportDiagnostics()
      .then((path) => {
        if (path) toast.success(t("settings.advanced.diagnostics.done", { path }));
      })
      .catch((error: unknown) => {
        showErrorToast(toAppError(error));
      });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) acknowledge();
      }}
      title={t("crash.title")}
      description={t("crash.description")}
      confirmLabel={t("crash.export")}
      cancelLabel={t("crash.later")}
      onConfirm={exportDiagnostics}
    />
  );
}
