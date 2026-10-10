import { Fragment, useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { levelOf, shownWindows } from "@/features/agents/usageLimits";
import { useUsageLimits } from "@/features/agents/useUsageLimits";
import { useFormatters } from "@/features/settings/useFormatters";
import { useSettings } from "@/features/settings/useSettings";
import type { UsageWindow } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

/**
 * One usage limit in the button: its percentage, emphasized from 80% or Claude Code's warning, and,
 * at its limit, when it resets (ADR 0043).
 */
function UsageFigure({ window, now }: { window: UsageWindow; now: Date }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const level = levelOf(window);
  const text =
    level !== "reached"
      ? t(`sessions.figures.${window.kind}`, { percent: window.percent })
      : window.resetsAt === null
        ? t(`sessions.figures.${window.kind}Reached`)
        : t(`sessions.figures.${window.kind}ReachedResets`, {
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
 * The figures before Send (ADR 0044): the usage limits Claude Code reports, whatever session is
 * open, in one quiet button that opens their details. Nothing when there is nothing to show.
 */
export function Figures() {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const id = useId();
  const now = new Date();
  const limits = useUsageLimits();
  const windows = useSettings().agents.showUsageLimits ? shownWindows(limits, now) : [];
  if (windows.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="min-w-0 font-normal text-muted-foreground tabular-nums"
        >
          {windows.map((window, index) => (
            <Fragment key={window.kind}>
              {index > 0 ? (
                <>
                  {" "}
                  <span aria-hidden>·</span>{" "}
                </>
              ) : null}
              <UsageFigure window={window} now={now} />
            </Fragment>
          ))}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby={`${id}-usage`}>
        <h2 id={`${id}-usage`} className="text-xs font-medium">
          {t("sessions.figures.usageLimits")}
        </h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {windows.map((window) => (
            <Fragment key={window.kind}>
              <dt className="text-muted-foreground">
                {t(`sessions.figures.windows.${window.kind}`)}
              </dt>
              <dd className="text-end tabular-nums">
                {window.resetsAt === null
                  ? t("sessions.figures.used", { percent: window.percent })
                  : t("sessions.figures.usedAndReset", {
                      percent: window.percent,
                      time: formatters.resetTime(new Date(window.resetsAt), now),
                    })}
              </dd>
            </Fragment>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
