import { ShieldAlertIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AvailablePlugin, PluginScope, Project } from "@/ipc/bindings";

/** The scopes a plugin can be installed at, in the order they are offered (ADR 0053). */
const installScopes = ["user", "local", "project"] as const satisfies readonly PluginScope[];

type InstallScope = (typeof installScopes)[number];

/**
 * The install choices (ADR 0053, the prototype's variant A): who gets the plugin, each choice with
 * a line saying what it means; for the two project choices, a folder project from a menu, the open
 * session's first; and the warning that a plugin can run programs on this computer.
 */
export function InstallDialog({
  plugin,
  projects,
  open,
  onOpenChange,
  onInstall,
}: {
  plugin: AvailablePlugin;
  /** The folder projects a plugin can be installed for, the open session's first. */
  projects: readonly Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (scope: InstallScope, project: Project | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [scope, setScope] = useState<InstallScope>("user");
  const [projectId, setProjectId] = useState(projects[0]?.id);
  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  // Each choice's line has its own key, so the translations can be found and checked.
  const details: Record<InstallScope, string> = {
    user: t("plugins.install.userDetail"),
    local: t("plugins.install.localDetail"),
    project: t("plugins.install.projectDetail"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plugins.install.title", { name: plugin.name })}</DialogTitle>
          <DialogDescription>{t("plugins.install.who")}</DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={scope}
          aria-label={t("plugins.install.who")}
          onValueChange={(value) => {
            const chosen = installScopes.find((candidate) => candidate === value);
            if (chosen) setScope(chosen);
          }}
        >
          {installScopes.map((choice) => (
            <div key={choice} className="flex items-start gap-3 py-1">
              <RadioGroupItem
                id={`${id}-${choice}`}
                value={choice}
                className="mt-0.5"
                disabled={choice !== "user" && projects.length === 0}
              />
              <label htmlFor={`${id}-${choice}`} className="flex flex-col gap-0.5">
                <span className="text-sm">{t(`plugins.scope.${choice}`)}</span>
                <span className="text-xs text-muted-foreground">{details[choice]}</span>
              </label>
            </div>
          ))}
        </RadioGroup>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("plugins.install.noProject")}</p>
        ) : null}
        {scope !== "user" && project ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-menu`} className="text-xs font-medium">
              {t("plugins.install.project")}
            </label>
            <select
              id={`${id}-menu`}
              className="h-8 w-full border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={project.id}
              onChange={(event) => {
                setProjectId(event.target.value);
              }}
            >
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t("plugins.discover.warning")}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("plugins.install.cancel")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onInstall(scope, scope === "user" ? undefined : project);
            }}
          >
            {t("plugins.install.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
