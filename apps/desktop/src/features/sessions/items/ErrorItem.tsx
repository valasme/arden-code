import { CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ErrorCode } from "@/ipc/bindings";

/**
 * Something that went wrong. An error the agent reports shows its words; one Arden Code knows has a
 * code, and says what happened and what to do, with the agent's own reason when it gave one.
 */
export function ErrorItem({ message, code }: { message: string; code: ErrorCode | null }) {
  const { t } = useTranslation();

  if (code !== null) {
    return (
      <div className="my-2 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
        <CircleAlertIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-destructive"
          strokeWidth={1.5}
        />
        <div className="flex min-w-0 flex-col gap-1 break-words">
          <p className="font-medium">{t(`errors.${code}.what`)}</p>
          <p>{t(`errors.${code}.action`)}</p>
          {code === "ARD-AGT-013" && message !== "" ? (
            <p className="font-mono text-muted-foreground">{message}</p>
          ) : null}
          <p className="text-2xs text-muted-foreground">{code}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
      <p className="min-w-0 break-words">
        <span className="font-medium">{t("items.error.label")}</span> {message}
      </p>
    </div>
  );
}
