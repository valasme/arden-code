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

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm"
    >
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
      <div className="flex min-w-0 flex-col gap-1 break-words">
        <p className="font-medium">{t(`errors.${error.code}.what`)}</p>
        <p>{t(`errors.${error.code}.action`)}</p>
        {ownWords ? <p className="font-mono text-muted-foreground">{ownWords}</p> : null}
        <p className="text-2xs text-muted-foreground">{error.code}</p>
      </div>
    </div>
  );
}
