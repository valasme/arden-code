import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeftIcon, DownloadIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useFormatters } from "@/features/settings/useFormatters";
import { type AvailablePlugin, commands } from "@/ipc/bindings";
import { pluginCatalogQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { usePluginsPageStore } from "@/state/pluginsPage";

import { InstallDialog } from "./InstallDialog";
import { PluginsProblem } from "./PluginsProblem";

/** The height of a row of the list, which every row has, so the list can be drawn in part. */
const ROW_HEIGHT = 52;

/**
 * The plugins that match what was typed in the sidebar's search, by name and description: the most
 * installed first, then by name (ADR 0053). Most plugins have no install count; they follow.
 */
export function discoverable(
  catalog: readonly AvailablePlugin[],
  query: string,
): AvailablePlugin[] {
  const wanted = query.trim().toLowerCase();
  return catalog
    .filter(
      (plugin) =>
        wanted === "" ||
        plugin.name.toLowerCase().includes(wanted) ||
        (plugin.description ?? "").toLowerCase().includes(wanted),
    )
    .toSorted((a, b) => (b.installs ?? -1) - (a.installs ?? -1) || a.name.localeCompare(b.name));
}

/**
 * A plugin's details: what it is, where it comes from, and what installing one can mean, with
 * Install, which asks who gets it first. While it installs, and once it has, the pane says so; the
 * plugins installed and offered are read again afterwards.
 */
function Details({ plugin, onBack }: { plugin: AvailablePlugin; onBack: () => void }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const install = useMutation({
    mutationFn: () => commands.installPlugin(plugin.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["plugins"], refetchType: "all" }),
  });
  const installs =
    plugin.installs === null
      ? t("plugins.discover.noInstalls")
      : t("plugins.discover.installs", {
          count: plugin.installs,
          formatted: formatters.number(plugin.installs),
        });

  return (
    <section aria-label={plugin.name} className="flex min-w-0 flex-col gap-4 overflow-y-auto p-5">
      <Button
        variant="ghost"
        size="sm"
        className="self-start @min-[40rem]/discover:hidden"
        onClick={onBack}
      >
        <ArrowLeftIcon aria-hidden strokeWidth={1.5} />
        {t("plugins.discover.back")}
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-words">{plugin.name}</h2>
          <p className="text-xs text-muted-foreground">
            {plugin.marketplace} · {installs}
          </p>
        </div>
        <Button
          disabled={install.isPending}
          onClick={() => {
            setChoosing(true);
          }}
        >
          <DownloadIcon aria-hidden strokeWidth={1.5} />
          {t("plugins.install.open")}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm empty:hidden">
        {install.isPending ? t("plugins.install.underWay", { name: plugin.name }) : null}
        {install.isSuccess ? install.data.message : null}
      </div>
      {install.isError ? <PluginsProblem error={toAppError(install.error)} /> : null}
      {plugin.description ? <p className="text-sm">{plugin.description}</p> : null}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("plugins.discover.marketplace")}</dt>
        <dd>{plugin.marketplace}</dd>
        <dt className="text-muted-foreground">{t("plugins.discover.version")}</dt>
        <dd>{plugin.version ?? t("plugins.discover.noVersion")}</dd>
        <dt className="text-muted-foreground">{t("plugins.discover.installsLabel")}</dt>
        <dd>{installs}</dd>
        <dt className="text-muted-foreground">{t("plugins.discover.source")}</dt>
        <dd className="font-mono break-all">{plugin.source}</dd>
      </dl>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t("plugins.discover.warning")}
      </p>
      <InstallDialog
        plugin={plugin}
        open={choosing}
        onOpenChange={setChoosing}
        onInstall={() => {
          install.mutate();
        }}
      />
    </section>
  );
}

/**
 * The plugins as a list the keyboard moves through: the list holds the focus and names the chosen
 * row, and only the rows on screen are drawn.
 */
function PluginList({
  plugins,
  chosen,
  onChoose,
}: {
  plugins: readonly AvailablePlugin[];
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  // The virtualizer's functions cannot be memoized, so the compiler leaves this component alone.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: plugins.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => plugins[index]?.id ?? index,
  });
  const at = plugins.findIndex((plugin) => plugin.id === chosen);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = plugins.length - 1;
    const targets: Record<string, number> = {
      ArrowDown: Math.min(at + 1, last),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: last,
    };
    const next = targets[event.key];
    const plugin = next === undefined ? undefined : plugins[next];
    if (next === undefined || !plugin) return;
    event.preventDefault();
    onChoose(plugin.id);
    virtualizer.scrollToIndex(next);
  };

  return (
    <div
      ref={scroller}
      id={listId}
      // A list the keyboard moves through, with thousands of rows, which a native select cannot be.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="listbox"
      tabIndex={0}
      aria-label={t("plugins.discover.label")}
      aria-activedescendant={at >= 0 ? `${listId}-${String(at)}` : undefined}
      className="min-h-0 overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onKeyDown={onKeyDown}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const plugin = plugins[row.index];
          if (!plugin) return null;
          return (
            <div
              key={row.key}
              id={`${listId}-${String(row.index)}`}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="option"
              aria-selected={plugin.id === chosen}
              // The list holds the focus and names the chosen row; a row takes it only from a click.
              tabIndex={-1}
              className={cn(
                "absolute inset-x-0 flex cursor-pointer flex-col justify-center gap-0.5 px-3 hover:bg-muted",
                plugin.id === chosen && "bg-accent text-accent-foreground hover:bg-accent",
              )}
              style={{ top: row.start, height: ROW_HEIGHT }}
              onMouseDown={(event) => {
                // The list keeps the focus, so the arrow keys go on from the row clicked.
                event.preventDefault();
                scroller.current?.focus();
                onChoose(plugin.id);
              }}
            >
              <span data-plugin-name className="truncate text-sm font-medium">
                {plugin.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {plugin.description ?? plugin.marketplace}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The Discover tab (ADR 0053, the prototype's variant A): every plugin the person's marketplaces
 * offer, read once in a run of Arden Code and again on Refresh, beside the chosen one's details.
 * Below the width of both panes, the details take the list's place, with a way back.
 */
export function DiscoverTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = usePluginsPageStore((state) => state.query);
  const catalog = useQuery(pluginCatalogQuery);
  const refresh = useMutation({
    mutationFn: () => commands.pluginCatalog(true),
    onSuccess: (fresh) => {
      queryClient.setQueryData(pluginCatalogQuery.queryKey, fresh);
    },
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const shown = useMemo(() => discoverable(catalog.data ?? [], query), [catalog.data, query]);
  // The first plugin is chosen until the person chooses another.
  const plugin = shown.find((candidate) => candidate.id === chosen) ?? shown[0] ?? null;

  const problem = refresh.error ?? catalog.error;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {catalog.data
            ? t("plugins.discover.count", { count: shown.length })
            : catalog.isError
              ? ""
              : t("plugins.discover.reading")}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={refresh.isPending || catalog.isFetching}
          onClick={() => {
            refresh.mutate();
          }}
        >
          <RefreshCwIcon
            aria-hidden
            strokeWidth={1.5}
            className={cn(refresh.isPending && "animate-spin")}
          />
          {t("plugins.discover.refresh")}
        </Button>
      </div>
      {problem ? <PluginsProblem error={toAppError(problem)} /> : null}
      {catalog.data ? (
        <div className="@container/discover">
          <div className="grid h-[max(20rem,calc(100vh-17rem))] grid-cols-1 border border-border @min-[40rem]/discover:grid-cols-[minmax(0,18rem)_1fr]">
            <div
              className={cn(
                "flex min-h-0 flex-col @min-[40rem]/discover:border-e @min-[40rem]/discover:border-border",
                showing && plugin && "hidden @min-[40rem]/discover:flex",
              )}
            >
              <PluginList
                plugins={shown}
                chosen={plugin?.id ?? null}
                onChoose={(id) => {
                  setChosen(id);
                  setShowing(true);
                }}
              />
            </div>
            <div
              className={cn(
                "min-h-0 min-w-0",
                !(showing && plugin) && "hidden @min-[40rem]/discover:flex",
              )}
            >
              {plugin ? (
                <Details
                  // A plugin's install, under way or done, is its own.
                  key={plugin.id}
                  plugin={plugin}
                  onBack={() => {
                    setShowing(false);
                  }}
                />
              ) : (
                <p className="m-auto p-5 text-sm text-muted-foreground">
                  {shown.length === 0
                    ? t("plugins.discover.noMatch")
                    : t("plugins.discover.choose")}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
