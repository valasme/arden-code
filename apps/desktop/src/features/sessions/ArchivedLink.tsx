import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { sidebarRow } from "@/components/layout/sidebarRow";
import { noSessions, sessionListQuery } from "@/ipc/queries";

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
