import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SquarePenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useCommands } from "@/features/commands/CommandsProvider";
import { projectsQuery } from "@/ipc/queries";

/** The projects and their sessions, with the button that starts a new one. */
export function SessionsNav() {
  const { t } = useTranslation();
  const { run } = useCommands();
  const { data: projects = [] } = useQuery(projectsQuery);

  return (
    <>
      <CommandTooltip command="session.new">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => {
            run("session.new");
          }}
        >
          <SquarePenIcon aria-hidden className="size-4" strokeWidth={1.5} />
          {t("sessions.new")}
        </Button>
      </CommandTooltip>
      <h2 className="px-2 pt-2 text-xs font-medium text-muted-foreground">
        {t("sidebar.projects")}
      </h2>
      {projects.map(({ project, sessions }) => (
        <section key={project.id} aria-labelledby={`project-${project.id}`}>
          <h3 id={`project-${project.id}`} className="px-2 pb-1 text-xs font-medium">
            {project.kind === "playground" ? t("sessions.playground") : project.name}
          </h3>
          {sessions.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">{t("sidebar.noSessions")}</p>
          ) : (
            <ul>
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    to="/session/$id"
                    params={{ id: session.id }}
                    className="block truncate px-2 py-1 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:font-medium forced-colors:[&.active]:underline"
                  >
                    {session.title ?? t("sessions.untitled")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
