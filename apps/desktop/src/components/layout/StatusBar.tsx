import { useQuery } from "@tanstack/react-query";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { appInfoQuery } from "@/ipc/queries";
import { useLayoutStore } from "@/state/layout";

/** Agent status, update status and notices, later. For now: the region toggles and the version. */
export function StatusBar() {
  const { t } = useTranslation();
  const { data } = useQuery(appInfoQuery);
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen);
  const inspectorOpen = useLayoutStore((state) => state.inspectorOpen);
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const toggleInspector = useLayoutStore((state) => state.toggleInspector);

  const toggleClass =
    "grid size-6 place-items-center hover:bg-muted active:bg-border forced-colors:hover:outline forced-colors:hover:outline-1";

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-background px-1 text-xs text-muted-foreground tabular-nums">
      <button
        type="button"
        aria-label={sidebarOpen ? t("statusBar.hideSidebar") : t("statusBar.showSidebar")}
        className={toggleClass}
        onClick={toggleSidebar}
      >
        <PanelLeftIcon aria-hidden className="size-4" strokeWidth={1.5} />
      </button>
      <span>{data ? t("statusBar.version", { version: data.version }) : null}</span>
      <button
        type="button"
        aria-label={inspectorOpen ? t("statusBar.hideInspector") : t("statusBar.showInspector")}
        className={toggleClass}
        onClick={toggleInspector}
      >
        <PanelRightIcon aria-hidden className="size-4" strokeWidth={1.5} />
      </button>
    </footer>
  );
}
