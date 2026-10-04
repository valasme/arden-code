import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { commands, type Detection } from "@/ipc/bindings";
import { agentsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/**
 * The page that says how to install the agent when it is missing, or how to update it when it is
 * too old. An agent that is ready has nothing to do, so no button.
 */
function NextStep({ agent, name }: { agent: Detection; name: string }) {
  const { t } = useTranslation();
  const step = agent.installed ? (agent.tooOld ? "update" : undefined) : "install";
  if (step === undefined) return null;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        aria-label={t(`settings.agents.${step}Label`, { name })}
        onClick={() => {
          commands.openLink(agent.installUrl, false).catch((error: unknown) => {
            showErrorToast(toAppError(error));
          });
        }}
      >
        {t(`settings.agents.${step}`)}
      </Button>
    </div>
  );
}

function AgentRow({ agent }: { agent: Detection }) {
  const { t } = useTranslation();
  const name = t(`settings.agents.names.${agent.cli}`);

  return (
    <section
      aria-labelledby={`agent-${agent.cli}`}
      className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0"
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
            <dt className="w-20 shrink-0 text-muted-foreground">{t("settings.agents.version")}</dt>
            <dd className="tabular-nums">{agent.version ?? t("settings.agents.versionUnknown")}</dd>
          </div>
          {agent.minimumVersion === null ? null : (
            <div className="flex gap-2 py-0.5">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("settings.agents.minimum")}
              </dt>
              <dd className="tabular-nums">
                {t("settings.agents.minimumValue", { version: agent.minimumVersion })}
              </dd>
            </div>
          )}
          {agent.signedIn === null ? null : (
            <div className="flex gap-2 py-0.5">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("settings.agents.account")}
              </dt>
              <dd>
                {agent.signedIn ? t("settings.agents.signedIn") : t("settings.agents.signedOut")}
              </dd>
            </div>
          )}
          <div className="flex gap-2 py-0.5">
            <dt className="w-20 shrink-0 text-muted-foreground">{t("settings.agents.path")}</dt>
            <dd className="min-w-0 break-all">
              <code>{agent.path}</code>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">{t("settings.agents.notFound", { name })}</p>
      )}
      {agent.installed && agent.tooOld ? (
        <p className="flex items-start gap-2 text-xs">
          <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          {t("settings.agents.tooOld")}
        </p>
      ) : null}
      {agent.installed && agent.signedIn === false ? (
        <p className="text-xs text-muted-foreground">{t("settings.agents.howToSignIn")}</p>
      ) : null}
      <NextStep agent={agent} name={name} />
    </section>
  );
}

/**
 * Settings → Agents: which agent programs are installed, and whether Claude Code can work (ADR 0039).
 * It only looks; it changes nothing. What Arden Code found after it started is shown, and Look
 * again looks afresh.
 */
export function AgentsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isFetching } = useQuery(agentsQuery);
  const [looking, setLooking] = useState(false);
  const lookAgain = () => {
    setLooking(true);
    commands
      .detectAgents(true)
      .then((found) => {
        queryClient.setQueryData(agentsQuery.queryKey, found);
      })
      .catch((failure: unknown) => {
        showErrorToast(toAppError(failure));
      })
      .finally(() => {
        setLooking(false);
      });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.agents.description")}</p>
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
      {data ? (
        <div className="border border-border">
          {data.map((agent) => (
            <AgentRow key={agent.cli} agent={agent} />
          ))}
        </div>
      ) : null}
      <div className="pt-4">
        <Button variant="outline" disabled={isFetching || looking} onClick={lookAgain}>
          {t("settings.agents.lookAgain")}
        </Button>
      </div>
    </div>
  );
}
