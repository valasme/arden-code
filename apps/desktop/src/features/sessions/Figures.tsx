import { Fragment, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { levelOf, shownWindows, type UsageLevel } from "@/features/agents/usageLimits";
import { useUsageLimits } from "@/features/agents/useUsageLimits";
import { useFormatters } from "@/features/settings/useFormatters";
import { useSettings } from "@/features/settings/useSettings";
import type { ContextWindow, UsageWindow } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

/** From this share of the point where the agent CLI compacts the conversation, it is near. */
const NEAR_COMPACTING = 0.8;

/**
 * How near a context window is to being compacted: from 80% of the point where the agent CLI
 * compacts it, or of the whole window when it does not (ADR 0044).
 */
function contextLevelOf(window: ContextWindow): UsageLevel {
  const limit = window.compactsAt ?? window.size;
  return window.used >= limit * NEAR_COMPACTING ? "near" : "normal";
}

/** One figure in the button, emphasized near its limit. */
function Figure({ level, children }: { level: UsageLevel; children: ReactNode }) {
  return (
    <span
      data-level={level}
      className={cn("whitespace-nowrap", level !== "normal" && "font-medium text-foreground")}
    >
      {children}
    </span>
  );
}

/**
 * One usage limit in the button: its percentage, emphasized from 80% or Claude Code's warning, and,
 * at its limit, when it resets (ADR 0043).
 */
function UsageFigure({ window, now }: { window: UsageWindow; now: Date }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const level = levelOf(window);
  return (
    <Figure level={level}>
      {level !== "reached"
        ? t(`sessions.figures.${window.kind}`, { percent: window.percent })
        : window.resetsAt === null
          ? t(`sessions.figures.${window.kind}Reached`)
          : t(`sessions.figures.${window.kind}ReachedResets`, {
              time: formatters.resetTime(new Date(window.resetsAt), now),
            })}
    </Figure>
  );
}

/** The context window's details: the tokens used, where it is compacted, and what fills it. */
function ContextDetails({ window, headingId }: { window: ContextWindow; headingId: string }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  return (
    <section>
      <h2 id={headingId} className="text-xs font-medium">
        {t("sessions.figures.contextWindow")}
      </h2>
      <p className="mt-1 text-xs tabular-nums">
        {t("sessions.figures.contextUsed", {
          percent: window.percent,
          used: formatters.tokens(window.used),
          size: formatters.tokens(window.size),
        })}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {window.compactsAt === null
          ? t("sessions.figures.notCompacted")
          : t("sessions.figures.compactedAt", {
              percent: Math.round((window.compactsAt / window.size) * 100),
            })}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {/* What is loaded only when needed is not in the window yet. */}
        {window.parts
          .filter((part) => part.kind !== "deferred")
          .map((part) => (
            <Fragment key={part.name}>
              <dt className="text-muted-foreground">{part.name}</dt>
              <dd className="text-end tabular-nums">{formatters.tokens(part.tokens)}</dd>
            </Fragment>
          ))}
      </dl>
    </section>
  );
}

/** The usage limits' details: each window's percentage and when it resets. */
function UsageDetails({
  windows,
  now,
  headingId,
}: {
  windows: UsageWindow[];
  now: Date;
  headingId: string;
}) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  return (
    <section>
      <h2 id={headingId} className="text-xs font-medium">
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
    </section>
  );
}

/**
 * The figures before Send (ADR 0044): how full the session's context window is, when its agent has
 * reported it, and the usage limits Claude Code reports, whatever session is open, in one quiet
 * button that opens their details. Nothing when there is nothing to show.
 */
export function Figures({ contextWindow = null }: { contextWindow?: ContextWindow | null }) {
  const { t } = useTranslation();
  const id = useId();
  const now = new Date();
  const limits = useUsageLimits();
  const windows = useSettings().agents.showUsageLimits ? shownWindows(limits, now) : [];
  if (contextWindow === null && windows.length === 0) return null;

  const figures = [
    ...(contextWindow === null
      ? []
      : [
          <Figure key="context" level={contextLevelOf(contextWindow)}>
            {t("sessions.figures.context", { percent: contextWindow.percent })}
          </Figure>,
        ]),
    ...windows.map((window) => <UsageFigure key={window.kind} window={window} now={now} />),
  ];
  const contextHeading = `${id}-context`;
  const usageHeading = `${id}-usage`;
  const headings = [
    ...(contextWindow === null ? [] : [contextHeading]),
    ...(windows.length === 0 ? [] : [usageHeading]),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="min-w-0 font-normal text-muted-foreground tabular-nums"
        >
          {figures.map((figure, index) => (
            <Fragment key={figure.key}>
              {index > 0 ? (
                <>
                  {" "}
                  <span aria-hidden>·</span>{" "}
                </>
              ) : null}
              {figure}
            </Fragment>
          ))}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby={headings.join(" ")} className="flex flex-col gap-4">
        {contextWindow === null ? null : (
          <ContextDetails window={contextWindow} headingId={contextHeading} />
        )}
        {windows.length === 0 ? null : (
          <UsageDetails windows={windows} now={now} headingId={usageHeading} />
        )}
      </PopoverContent>
    </Popover>
  );
}
