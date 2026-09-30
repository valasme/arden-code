import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { commands, type Detection } from "@/ipc/bindings";
import { agentsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

function AgentRow({ agent }: { agent: Detection }) {
  const { t } = useTranslation();
  const name = t(`settings.agents.names.${agent.cli}`);

  return (
    <section
      aria-labelledby={`agent-${agent.cli}`}
      className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 id={`agent-${agent.cli}`} className="text-sm font-medium">
          {name}
        </h3>
        <span className="text-xs font-medium">
          {agent.installed ? t("settings.agents.installed") : t("settings.agents.notInstalled")}
        </span>
      </div>
      {agent.installed ? (
        <dl className="text-xs">
          <div className="flex gap-2 py-0.5">
            <dt className="w-16 shrink-0 text-muted-foreground">{t("settings.agents.version")}</dt>
            <dd className="tabular-nums">{agent.version ?? t("settings.agents.versionUnknown")}</dd>
          </div>
          <div className="flex gap-2 py-0.5">
            <dt className="w-16 shrink-0 text-muted-foreground">{t("settings.agents.path")}</dt>
            <dd className="min-w-0 break-all">
              <code>{agent.path}</code>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">{t("settings.agents.notFound", { name })}</p>
      )}
      <div>
        <Button
          variant="outline"
          size="sm"
          aria-label={t("settings.agents.installLabel", { name })}
          onClick={() => {
            commands.openLink(agent.installUrl, false).catch((error: unknown) => {
              showErrorToast(toAppError(error));
            });
          }}
        >
          {t("settings.agents.install")}
        </Button>
      </div>
    </section>
  );
}

/** Settings → Agents: which agent programs are installed. It only looks; it changes nothing. */
export function AgentsTab() {
  const { t } = useTranslation();
  const { data, error, isFetching, refetch } = useQuery(agentsQuery);

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{t("settings.agents.description")}</p>
      {error ? (
        <p className="py-2 text-sm">
          {t(`errors.${toAppError(error).code}.what`)} ({toAppError(error).code})
        </p>
      ) : null}
      {data === undefined && !error ? (
        <output className="block py-4 text-sm text-muted-foreground">
          {t("settings.agents.looking")}
        </output>
      ) : null}
      {data?.map((agent) => (
        <AgentRow key={agent.cli} agent={agent} />
      ))}
      <div className="pt-2">
        <Button
          variant="outline"
          disabled={isFetching}
          onClick={() => {
            refetch().catch(() => {});
          }}
        >
          {t("settings.agents.checkAgain")}
        </Button>
      </div>
    </div>
  );
}
