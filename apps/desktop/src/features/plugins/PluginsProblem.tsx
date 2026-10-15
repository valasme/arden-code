import { CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AppError } from "@/ipc/bindings";

/**
 * Why the agent's plugins could not be read or changed (ADR 0053): what happened, what to do,
 * Claude Code's own words when it gave them, and the code. Without Claude Code, or with one too old
 * for plugins, this is all the page shows, and no command runs.
 */
export function PluginsProblem({ error }: { error: AppError }) {
  const { t } = useTranslation();
  const ownWords = error.code === "ARD-AGT-021" ? error.details : null;
  // Claude's own codes speak of sending a message; on this page, the step is to look again.
  const actionHere: Partial<Record<string, string>> = {
    "ARD-AGT-007": t("plugins.actions.notInstalled"),
    "ARD-AGT-010": t("plugins.actions.stopped"),
    "ARD-AGT-012": t("plugins.actions.npmWrapper"),
  };

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm"
    >
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
      <div className="flex min-w-0 flex-col gap-1 break-words">
        <p className="font-medium">{t(`errors.${error.code}.what`)}</p>
        <p>{actionHere[error.code] ?? t(`errors.${error.code}.action`)}</p>
        {ownWords ? <p className="font-mono text-muted-foreground">{ownWords}</p> : null}
        <p className="text-2xs text-muted-foreground">{error.code}</p>
      </div>
    </div>
  );
}
