import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { sidebarRow } from "@/components/layout/sidebarRow";
import { Button } from "@/components/ui/button";
import { noSessions, sessionListQuery } from "@/ipc/queries";

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

/** The sidebar's way to the archived sessions, with how many there are. Shown while there are any. */
export function ArchivedLink() {
  const { t } = useTranslation();
  const { data: list = noSessions } = useQuery(sessionListQuery);

  if (list.archived.length === 0) return null;
  return (
    <Link to="/archived" className={sidebarRow}>
      <ArchiveIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
      {t("sidebar.archived")}
      <span className="ms-auto text-xs text-muted-foreground tabular-nums">
        {list.archived.length}
      </span>
    </Link>
  );
}
