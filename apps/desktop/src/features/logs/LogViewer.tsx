import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormatters } from "@/features/settings/useFormatters";
import { commands } from "@/ipc/bindings";
import { logsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { filterEntries, levelNameOf, levels, noFilter, sourcesOf, type LogFilter } from "./filter";

/** How many entries the table shows at first, and how many more each "Show more" adds. */
const PAGE = 200;

const selectClass =
  "h-8 border border-input bg-background px-2 text-xs text-foreground dark:bg-input/30";

const levelClass: Record<string, string> = {
  error: "text-destructive font-medium",
  warn: "font-medium",
  debug: "text-muted-foreground",
  trace: "text-muted-foreground",
};

/** The log files, newest entry first, with filters for level, source and text. */
export function LogViewer() {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const { data, refetch, isFetching } = useQuery(logsQuery);
  const [filter, setFilter] = useState<LogFilter>(noFilter);
  const [shown, setShown] = useState(PAGE);

  const entries = data ?? [];
  const matching = filterEntries(entries, filter);
  const visible = matching.slice(0, shown);
  const change = (next: Partial<LogFilter>) => {
    setFilter({ ...filter, ...next });
    setShown(PAGE);
  };

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{t("logs.title")}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{t("logs.description")}</p>

      <search className="my-4 flex flex-wrap items-end gap-3" aria-label={t("logs.filters")}>
        <label className="flex flex-col gap-1 text-xs">
          {t("logs.level")}
          <select
            className={selectClass}
            value={filter.level}
            onChange={(event) => {
              const value = event.target.value;
              change({ level: levels.find((level) => level === value) ?? "all" });
            }}
          >
            <option value="all">{t("logs.levelAll")}</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {t(`logs.levels.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("logs.source")}
          <select
            className={selectClass}
            value={filter.source}
            onChange={(event) => {
              change({ source: event.target.value });
            }}
          >
            <option value="all">{t("logs.sourceAll")}</option>
            {sourcesOf(entries).map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          {t("logs.search")}
          <Input
            type="search"
            value={filter.text}
            onChange={(event) => {
              change({ text: event.target.value });
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={isFetching}
          onClick={() => {
            refetch().catch(() => {});
          }}
        >
          {t("logs.refresh")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            commands.openLogsFolder().catch((error: unknown) => {
              showErrorToast(toAppError(error));
            });
          }}
        >
          {t("logs.folder")}
        </Button>
      </search>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("logs.none")}</p>
      ) : matching.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("logs.empty")}</p>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("logs.time")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("logs.level")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("logs.source")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {t("logs.message")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, index) => (
                <tr
                  // Entries have no identity of their own, and the list only ever grows at its end.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={`${entry.timestamp}-${index}`}
                  className="border-t border-border align-top"
                >
                  <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                    {formatters.dateTime(new Date(entry.timestamp))}
                  </td>
                  <td className={cn("py-1 pr-3", levelClass[entry.level])}>
                    {levelNameOf(entry.level)
                      ? t(`logs.levels.${levelNameOf(entry.level) ?? "info"}`)
                      : entry.level}
                  </td>
                  <td className="py-1 pr-3 break-all">{entry.source}</td>
                  <td className="py-1 break-words">
                    {entry.message}
                    {entry.code ? (
                      <span className="text-muted-foreground"> ({entry.code})</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            {t("logs.showing", { shown: visible.length, total: matching.length })}
            {matching.length > visible.length ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShown(shown + PAGE);
                }}
              >
                {t("logs.more")}
              </Button>
            ) : null}
          </p>
        </>
      )}
    </main>
  );
}
