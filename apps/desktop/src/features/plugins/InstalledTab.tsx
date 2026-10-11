import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTrustGate } from "@/features/sessions/useTrustGate";
import { commands, type InstalledPlugin, type PluginAction, type Project } from "@/ipc/bindings";
import { installedPluginsQuery, sessionListQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { usePluginsPageStore } from "@/state/pluginsPage";

import { afterChange } from "./afterChange";
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

/** A folder's path as Windows compares it: without the case of its letters or a closing slash. */
const samePath = (a: string, b: string) =>
  a.replace(/[\\/]+$/u, "").toLowerCase() === b.replace(/[\\/]+$/u, "").toLowerCase();

/** What a plugin allows here: a managed one nothing, a synced one only on and off. */
function allowed(plugin: InstalledPlugin) {
  const changeable =
    plugin.scope !== "managed" && plugin.scope !== "session" && plugin.scope !== "other";
  return {
    toggle: changeable,
    updateAndUninstall: changeable && plugin.scope !== "synced",
  };
}

/**
 * One installed plugin: its name and marketplace, where it is installed, its version, state and
 * load errors, and what can be done with it (ADR 0053). A project's plugin is changed in that
 * project, once the person trusts it; one whose folder is not a project here says how to change it.
 */
function InstalledRow({
  plugin,
  projects,
}: {
  plugin: InstalledPlugin;
  projects: readonly Project[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { gate, dialog } = useTrustGate();
  const [confirming, setConfirming] = useState(false);
  const forProject = plugin.scope === "project" || plugin.scope === "local";
  const project = forProject
    ? projects.find(
        (candidate) =>
          candidate.kind === "folder" &&
          plugin.projectPath !== null &&
          samePath(candidate.path, plugin.projectPath),
      )
    : undefined;
  const reachable = !forProject || project !== undefined;
  const can = allowed(plugin);
  const change = useMutation({
    mutationFn: (action: PluginAction) =>
      commands.changePlugin(action, plugin.id, plugin.scope, project?.id ?? null),
    onSettled: () => afterChange(queryClient),
  });
  const run = (action: PluginAction) => {
    void gate("claude", project, () => {
      change.mutate(action);
      return true;
    });
  };

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-medium">{plugin.name}</h2>
        {plugin.marketplace ? (
          <span className="text-xs text-muted-foreground">{plugin.marketplace}</span>
        ) : null}
        <span className="ms-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {plugin.enabled ? t("plugins.installed.on") : t("plugins.installed.off")}
          </span>
          {can.toggle && reachable ? (
            <Switch
              aria-label={t("plugins.installed.toggle", { name: plugin.name })}
              checked={plugin.enabled}
              disabled={change.isPending}
              onCheckedChange={(on) => {
                run(on ? "enable" : "disable");
              }}
            />
          ) : null}
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
      {plugin.scope === "synced" ? (
        <p className="text-xs text-muted-foreground">{t("plugins.installed.synced")}</p>
      ) : null}
      {!reachable && plugin.projectPath !== null ? (
        <p className="text-xs text-muted-foreground">
          {t("plugins.installed.openProject", { path: plugin.projectPath })}
        </p>
      ) : null}
      {can.updateAndUninstall && reachable ? (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={change.isPending}
            aria-label={t("plugins.installed.updateLabel", { name: plugin.name })}
            onClick={() => {
              run("update");
            }}
          >
            {t("plugins.installed.update")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={change.isPending}
            aria-label={t("plugins.installed.uninstallLabel", { name: plugin.name })}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("plugins.installed.uninstall")}
          </Button>
        </div>
      ) : null}
      <div aria-live="polite" className="text-xs empty:hidden">
        {change.isPending ? t("plugins.installed.changing", { name: plugin.name }) : null}
        {change.isSuccess ? change.data.message : null}
        {change.isSuccess && change.data.sessionsWaiting ? (
          <p className="text-muted-foreground">{t("plugins.waiting")}</p>
        ) : null}
      </div>
      {change.isError ? <PluginsProblem error={toAppError(change.error)} /> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("plugins.installed.uninstallTitle", { name: plugin.name })}
        description={t("plugins.installed.uninstallDescription", {
          scope: t(`plugins.scope.${plugin.scope}`),
        })}
        confirmLabel={t("plugins.installed.uninstall")}
        destructive
        onConfirm={() => {
          setConfirming(false);
          run("uninstall");
        }}
      />
      {dialog}
    </li>
  );
}

/**
 * The Installed tab (ADR 0053): every plugin the agents have installed, the ones from their
 * terminals too, filtered by the sidebar's search, each with what can be done with it.
 */
export function InstalledTab() {
  const { t } = useTranslation();
  const query = usePluginsPageStore((state) => state.query);
  const installed = useQuery(installedPluginsQuery);
  const projects =
    useQuery(sessionListQuery).data?.projects.map((listing) => listing.project) ?? [];

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
          projects={projects}
        />
      ))}
    </ul>
  );
}
