import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/ipc/bindings";
import { settingsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { ActionRow } from "./ActionRow";
import { SettingsList } from "./SettingsList";

function report(error: unknown) {
  showErrorToast(toAppError(error));
}

function openSettingsFile() {
  commands.openSettingsFile().catch(report);
}

function resetArdenCode() {
  commands.resetApp().catch(report);
}

function openLogsFolder() {
  commands.openLogsFolder().catch(report);
}

/** Advanced: the settings for people who look under the hood, and the ways to back up or reset. */
export function AdvancedTab({ onViewLogs }: { onViewLogs: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<"settings" | "app" | undefined>(undefined);

  const exportDiagnostics = () => {
    commands
      .exportDiagnostics()
      .then((path) => {
        if (path) toast.success(t("settings.advanced.diagnostics.done", { path }));
      })
      .catch(report);
  };

  const exportSettings = () => {
    commands
      .exportSettings()
      .then((path) => {
        if (path) toast.success(t("settings.advanced.export.done", { path }));
      })
      .catch(report);
  };

  const importSettings = () => {
    commands
      .importSettings()
      .then((imported) => {
        if (!imported) return;
        queryClient.setQueryData(settingsQuery.queryKey, imported);
        toast.success(t("settings.advanced.import.done"));
      })
      .catch(report);
  };

  const resetSettings = () => {
    commands
      .resetSettings()
      .then((saved) => {
        queryClient.setQueryData(settingsQuery.queryKey, saved);
        toast.success(t("settings.advanced.reset.done"));
      })
      .catch(report);
  };

  return (
    <div>
      <SettingsList tab="advanced" />
      <h2 className="mt-8 mb-2 text-xs font-medium text-muted-foreground">
        {t("settings.advanced.diagnostics.title")}
      </h2>
      <div className="border border-border">
        <ActionRow
          id="view-logs"
          label={t("settings.advanced.logs.view.label")}
          description={t("settings.advanced.logs.view.description")}
          button={t("settings.advanced.logs.view.button")}
          onClick={onViewLogs}
        />
        <ActionRow
          id="open-logs-folder"
          label={t("settings.advanced.logs.folder.label")}
          description={t("settings.advanced.logs.folder.description")}
          button={t("settings.advanced.logs.folder.button")}
          onClick={openLogsFolder}
        />
        <ActionRow
          id="export-diagnostics"
          label={t("settings.advanced.diagnostics.label")}
          description={t("settings.advanced.diagnostics.description")}
          button={t("settings.advanced.diagnostics.button")}
          onClick={exportDiagnostics}
        />
      </div>
      <h2 className="mt-8 mb-2 text-xs font-medium text-muted-foreground">
        {t("settings.advanced.files")}
      </h2>
      <div className="border border-border">
        <ActionRow
          id="open-settings-file"
          label={t("settings.advanced.openFile.label")}
          description={t("settings.advanced.openFile.description")}
          button={t("settings.advanced.openFile.button")}
          onClick={openSettingsFile}
        />
        <ActionRow
          id="export-settings"
          label={t("settings.advanced.export.label")}
          description={t("settings.advanced.export.description")}
          button={t("settings.advanced.export.button")}
          onClick={exportSettings}
        />
        <ActionRow
          id="import-settings"
          label={t("settings.advanced.import.label")}
          description={t("settings.advanced.import.description")}
          button={t("settings.advanced.import.button")}
          onClick={importSettings}
        />
      </div>
      <h2 className="mt-8 mb-2 text-xs font-medium text-muted-foreground">
        {t("settings.advanced.reset.title")}
      </h2>
      <div className="border border-border">
        <ActionRow
          id="reset-settings"
          label={t("settings.advanced.reset.label")}
          description={t("settings.advanced.reset.description")}
          button={t("settings.advanced.reset.button")}
          onClick={() => {
            setConfirming("settings");
          }}
        />
        <ActionRow
          id="reset-app"
          label={t("settings.advanced.resetApp.label")}
          description={t("settings.advanced.resetApp.description")}
          button={t("settings.advanced.resetApp.button")}
          onClick={() => {
            setConfirming("app");
          }}
        />
      </div>

      <ConfirmDialog
        open={confirming === "settings"}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
        title={t("settings.advanced.reset.confirmTitle")}
        description={t("settings.advanced.reset.confirmDescription")}
        confirmLabel={t("settings.advanced.reset.confirm")}
        destructive
        onConfirm={resetSettings}
      />
      <ConfirmDialog
        open={confirming === "app"}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
        title={t("settings.advanced.resetApp.confirmTitle")}
        description={t("settings.advanced.resetApp.confirmDescription")}
        confirmLabel={t("settings.advanced.resetApp.confirm")}
        destructive
        onConfirm={resetArdenCode}
      />
    </div>
  );
}
