import { ArchiveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { useSessionActions } from "./useSessionActions";

/**
 * What an archived session shows in place of the message box (ADR 0036): it is read-only until it
 * is unarchived. It stands where the message box does, so F6 reaches it the same way.
 */
export function ArchivedBar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const runAction = useSessionActions();

  return (
    <div data-area="messagebox" className="shrink-0 px-6 pb-4">
      <div className="mx-auto flex max-w-[45rem] flex-wrap items-center gap-3 border border-border bg-muted px-3 py-2">
        <ArchiveIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm">{t("sessions.archived.notice")}</p>
        <Button
          variant="outline"
          size="sm"
          className="ms-auto"
          onClick={() => {
            runAction("unarchive", sessionId);
          }}
        >
          {t("sessions.archived.unarchive")}
        </Button>
      </div>
    </div>
  );
}
