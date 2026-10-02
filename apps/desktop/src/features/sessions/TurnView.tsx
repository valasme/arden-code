import { memo } from "react";
import { useTranslation } from "react-i18next";

import { useFormatters } from "@/features/settings/useFormatters";
import type { Turn } from "@/ipc/bindings";

import { ItemView } from "./items/ItemView";

/**
 * One message and the reply to it (ADR 0032): the person's message is a filled block at the end of
 * the line, and the reply follows under the agent's name, with no box around it.
 */
export const TurnView = memo(function TurnView({ turn }: { turn: Turn }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const time = new Date(turn.startedAt);

  return (
    <div className="flex flex-col gap-3 py-5">
      <div className="flex flex-col items-end gap-1">
        <h3 className="sr-only">{t("sessions.you")}</h3>
        <p className="max-w-[85%] bg-muted px-3 py-2 text-base break-words whitespace-pre-wrap">
          {turn.prompt}
        </p>
        <time dateTime={turn.startedAt} className="text-2xs text-muted-foreground">
          {formatters.dateTime(time)}
        </time>
      </div>
      <div className="flex flex-col">
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">
          {t("sessions.demoAgent")}
        </h3>
        {turn.items.map((item) => (
          <ItemView key={item.id} item={item} streaming={turn.status === "running"} />
        ))}
        {turn.status === "running" ? (
          <output className="mt-2 block text-xs text-muted-foreground">
            {t("sessions.replying")}
          </output>
        ) : null}
        {turn.status === "failed" ? (
          <p className="mt-2 text-xs text-destructive">{t("sessions.stopped")}</p>
        ) : null}
      </div>
    </div>
  );
});
