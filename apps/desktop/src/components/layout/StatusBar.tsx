import { useQuery } from "@tanstack/react-query";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { commands } from "@/ipc/bindings";
import { appInfoQuery, updateStatusQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useLayoutStore } from "@/state/layout";
import { useRepliesStore } from "@/state/replies";

/**
 * The bar along the bottom: the region toggles at its ends, what the open session's agent is doing,
 * the update status and the version. The agent's state is not a live region: the reply announcer
 * already speaks for the reply (ADR 0027).
 */
export function StatusBar() {
  const { t } = useTranslation();
  const { data } = useQuery(appInfoQuery);
  const { data: update } = useQuery(updateStatusQuery);
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen);
  const inspectorOpen = useLayoutStore((state) => state.inspectorOpen);
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const toggleInspector = useLayoutStore((state) => state.toggleInspector);
  const replying = useRepliesStore((state) => state.busy);

  const toggleClass =
    "grid size-6 place-items-center hover:bg-muted active:bg-border forced-colors:hover:outline forced-colors:hover:outline-1";

  return (
    <footer
      data-area="statusbar"
      className="flex h-6 shrink-0 items-center border-t border-border bg-background px-1 text-xs text-muted-foreground tabular-nums"
    >
      <CommandTooltip command="sidebar.toggle">
        <button
          type="button"
          aria-label={sidebarOpen ? t("statusBar.hideSidebar") : t("statusBar.showSidebar")}
          className={toggleClass}
          onClick={toggleSidebar}
        >
          <PanelLeftIcon aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
      </CommandTooltip>
      {replying ? (
        <span className="ms-2 flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 bg-foreground" />
          <span className="truncate">
            {t("statusBar.replying", { agent: t("sessions.demoAgent") })}
          </span>
        </span>
      ) : null}
      <span className="ms-auto flex items-center gap-3 pe-2">
        {update?.state === "ready" ? (
          <button
            type="button"
            className="px-1.5 font-medium text-foreground underline underline-offset-2 hover:bg-muted"
            onClick={() => {
              commands.restartToUpdate().catch((error: unknown) => {
                showErrorToast(toAppError(error));
              });
            }}
          >
            {t("statusBar.updateReady")}
          </button>
        ) : null}
        {update?.state === "downloading" ? (
          <output>{t("statusBar.updateDownloading")}</output>
        ) : null}
        <span>{data ? t("statusBar.version", { version: data.version }) : null}</span>
      </span>
      <CommandTooltip command="inspector.toggle">
        <button
          type="button"
          aria-label={inspectorOpen ? t("statusBar.hideInspector") : t("statusBar.showInspector")}
          className={toggleClass}
          onClick={toggleInspector}
        >
          <PanelRightIcon aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
      </CommandTooltip>
    </footer>
  );
}
