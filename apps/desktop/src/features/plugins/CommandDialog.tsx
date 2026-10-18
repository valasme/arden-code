import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ShownCommand } from "@/ipc/bindings";

/**
 * A command a plugin's marketplace declares, shown in full before it runs (ADR 0053, councils'
 * Q14). Accepting installs again with exactly that command's `sha256`; Cancel leaves nothing
 * installed. A command that changed since it was accepted says so.
 */
export function CommandDialog({
  shown,
  marketplace,
  onAnswer,
}: {
  shown: ShownCommand | null;
  marketplace: string;
  onAnswer: (accepted: boolean) => void;
}) {
  const { t } = useTranslation();
  const name = shown?.plugin.split("@")[0] ?? "";

  return (
    <ConfirmDialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) onAnswer(false);
      }}
      title={t("plugins.command.title", { name })}
      description={t("plugins.command.description", { marketplace })}
      confirmLabel={t("plugins.command.accept")}
      onConfirm={() => {
        onAnswer(true);
      }}
    >
      {shown ? (
        <div className="flex flex-col gap-2">
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
            <code>{shown.command}</code>
          </pre>
          <p className="text-muted-foreground">
            {t("plugins.command.plugin", { plugin: shown.plugin })}
          </p>
          {shown.changed ? <p className="font-medium">{t("plugins.command.changed")}</p> : null}
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
