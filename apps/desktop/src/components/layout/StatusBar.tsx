import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { levelOf, shownWindows } from "@/features/agents/usageLimits";
import { useUsageLimits } from "@/features/agents/useUsageLimits";
import { useFormatters } from "@/features/settings/useFormatters";
import { useSettings } from "@/features/settings/useSettings";
import { commands, type UsageWindow } from "@/ipc/bindings";
import { appInfoQuery, updateStatusQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useRepliesStore } from "@/state/replies";

/**
 * One window of the usage limits: its percentage, emphasized from 80% or Claude Code's warning,
 * and, at its limit, when it resets (ADR 0043).
 */
function UsageFigure({ window, now }: { window: UsageWindow; now: Date }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const level = levelOf(window);
  const text =
    level !== "reached"
      ? t(`statusBar.usage.${window.kind}`, { percent: window.percent })
      : window.resetsAt === null
        ? t(`statusBar.usage.${window.kind}Reached`)
        : t(`statusBar.usage.${window.kind}ReachedResets`, {
            time: formatters.resetTime(new Date(window.resetsAt), now),
          });
  return (
    <span
      data-level={level}
      className={cn("whitespace-nowrap", level !== "normal" && "font-medium text-foreground")}
    >
      {text}
    </span>
  );
}

/**
 * The 5-hour and weekly limits Claude Code reports, whatever session is open, or nothing when it
 * reports none (ADR 0043). Not a live region: a refused reply says so itself.
 */
function UsageFigures() {
  const { t } = useTranslation();
  const now = new Date();
  const shown = useSettings().agents.showUsageLimits;
  const windows = shownWindows(useUsageLimits(), now);
  if (!shown || windows.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      <span className="sr-only">{t("statusBar.usage.label")}</span>
      {windows.map((window, index) => (
        <span key={window.kind} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden>·</span> : null}
          <UsageFigure window={window} now={now} />
        </span>
      ))}
    </span>
  );
}

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
  const waiting = useRepliesStore((state) => state.waiting);

  return (
    <footer
      data-area="statusbar"
      className="flex h-6 shrink-0 items-center border-t border-border bg-background px-1 text-xs text-muted-foreground tabular-nums"
    >
      {replying ? (
        <span className="ms-2 flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 bg-foreground" />
          <span className="truncate">
            {t(waiting ? "statusBar.waiting" : "statusBar.replying", {
              agent: t(`agents.${agent}.name`),
            })}
          </span>
        </span>
      ) : null}
      <span className="ms-auto flex min-w-0 items-center gap-3 pe-2">
        <UsageFigures />
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
