import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/** Starts the app again. Nothing comes back from a restart, so there is nothing to wait for. */
export function restartApp() {
  commands.restartApp().catch((error: unknown) => {
    showErrorToast(toAppError(error));
  });
}

/** Says a change waits for a restart, and offers to do it now. */
export function RestartNote({ note }: { note: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-muted-foreground">{note}</p>
      <Button size="sm" variant="outline" onClick={restartApp}>
        {t("settings.restart.now")}
      </Button>
    </div>
  );
}

/** Asks whether to restart now for a change that needs it. */
export function RestartPrompt({
  open,
  onOpenChange,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
}) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.restart.title")}
      description={description}
      confirmLabel={t("settings.restart.now")}
      cancelLabel={t("settings.restart.later")}
      onConfirm={restartApp}
    />
  );
}
