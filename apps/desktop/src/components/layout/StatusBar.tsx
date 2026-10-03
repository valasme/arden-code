import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { commands } from "@/ipc/bindings";
import { appInfoQuery, updateStatusQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { useRepliesStore } from "@/state/replies";

/**
 * The bar along the bottom: what the open session's agent is doing, the update status and the
 * version. It only says things; the toggles for the regions are in the title bar (ADR 0033). The
 * agent's state is not a live region: the reply announcer already speaks for the reply (ADR 0027).
 */
export function StatusBar() {
  const { t } = useTranslation();
  const { data } = useQuery(appInfoQuery);
  const { data: update } = useQuery(updateStatusQuery);
  const replying = useRepliesStore((state) => state.busy);
  const agent = useRepliesStore((state) => state.agent);

  return (
    <footer
      data-area="statusbar"
      className="flex h-6 shrink-0 items-center border-t border-border bg-background px-1 text-xs text-muted-foreground tabular-nums"
    >
      {replying ? (
        <span className="ms-2 flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 bg-foreground" />
          <span className="truncate">
            {t("statusBar.replying", { agent: t(`agents.${agent}.name`) })}
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
    </footer>
  );
}
