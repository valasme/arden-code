import { memo } from "react";
import { useTranslation } from "react-i18next";

import { useFormatters } from "@/features/settings/useFormatters";
import type { Turn } from "@/ipc/bindings";

import { ItemView } from "./items/ItemView";

/** One message and the reply to it. */
export const TurnView = memo(function TurnView({ turn }: { turn: Turn }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const time = new Date(turn.startedAt);

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4">
      <div>
        <h3 className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
          {t("sessions.you")}
          <time dateTime={turn.startedAt} className="font-normal">
            {formatters.dateTime(time)}
          </time>
        </h3>
        <p className="mt-1 text-sm whitespace-pre-wrap">{turn.prompt}</p>
      </div>
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">{t("sessions.demoAgent")}</h3>
        {turn.items.map((item) => (
          <ItemView key={item.id} item={item} streaming={turn.status === "running"} />
        ))}
        {turn.status === "running" ? (
          <output className="mt-1 block text-xs text-muted-foreground">
            {t("sessions.replying")}
          </output>
        ) : null}
        {turn.status === "failed" ? (
          <p className="mt-1 text-xs text-destructive">{t("sessions.stopped")}</p>
        ) : null}
      </div>
    </div>
  );
});
