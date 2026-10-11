import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { InstalledPlugin } from "@/ipc/bindings";
import { installedPluginsQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { usePluginsPageStore } from "@/state/pluginsPage";

import { PluginsProblem } from "./PluginsProblem";

/** Whether a plugin matches what was typed in the sidebar's search: its name or marketplace. */
function matches(plugin: InstalledPlugin, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  return (
    wanted === "" ||
    plugin.name.toLowerCase().includes(wanted) ||
    plugin.marketplace.toLowerCase().includes(wanted)
  );
}

/** One installed plugin: its name and marketplace, where it is installed, its version and state. */
function InstalledRow({ plugin }: { plugin: InstalledPlugin }) {
  const { t } = useTranslation();

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-medium">{plugin.name}</h2>
        {plugin.marketplace ? (
          <span className="text-xs text-muted-foreground">{plugin.marketplace}</span>
        ) : null}
        <span className="ms-auto text-xs text-muted-foreground">
          {plugin.enabled ? t("plugins.installed.on") : t("plugins.installed.off")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(`plugins.scope.${plugin.scope}`)}
        {plugin.projectPath ? (
          <>
            {" · "}
            <span className="font-mono break-all">{plugin.projectPath}</span>
          </>
        ) : null}
        {plugin.version ? (
          <> · {t("plugins.installed.version", { version: plugin.version })}</>
        ) : null}
      </p>
      {plugin.errors.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-destructive">
          {plugin.errors.map((error) => (
            <li key={error} className="flex items-start gap-1.5">
              <CircleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
              {error}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The Installed tab (ADR 0053): every plugin the agents have installed, the ones from their
 * terminals too, filtered by the sidebar's search.
 */
export function InstalledTab() {
  const { t } = useTranslation();
  const query = usePluginsPageStore((state) => state.query);
  const installed = useQuery(installedPluginsQuery);

  if (installed.isError) return <PluginsProblem error={toAppError(installed.error)} />;
  if (!installed.data) {
    return <p className="text-sm text-muted-foreground">{t("plugins.installed.reading")}</p>;
  }
  if (installed.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("plugins.installed.none")}</p>;
  }
  const shown = installed.data.filter((plugin) => matches(plugin, query));
  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("plugins.installed.noMatch")}</p>;
  }
  return (
    <ul
      aria-label={t("plugins.installed.label")}
      className="divide-y divide-border border border-border"
    >
      {shown.map((plugin) => (
        <InstalledRow
          key={`${plugin.agent}:${plugin.id}:${plugin.scope}:${plugin.projectPath ?? ""}`}
          plugin={plugin}
        />
      ))}
    </ul>
  );
}
