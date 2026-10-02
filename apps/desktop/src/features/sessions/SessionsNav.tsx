import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SquarePenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ShortcutHint } from "@/components/layout/ShortcutHint";
import { sidebarRow } from "@/components/layout/sidebarRow";
import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useCommands } from "@/features/commands/CommandsProvider";
import { noSessions, sessionListQuery } from "@/ipc/queries";

/** The projects and their sessions, with the button that starts a new one. */
export function SessionsNav() {
  const { t } = useTranslation();
  const { run } = useCommands();
  const { data: list = noSessions } = useQuery(sessionListQuery);

  return (
    <>
      <CommandTooltip command="session.new">
        <button
          type="button"
          className={sidebarRow}
          onClick={() => {
            run("session.new");
          }}
        >
          <SquarePenIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
          {t("sessions.new")}
          <ShortcutHint command="session.new" />
        </button>
      </CommandTooltip>
      <h2 className="sr-only">{t("sidebar.projects")}</h2>
      {list.projects.map(({ project, sessions }) => (
        <section key={project.id} aria-labelledby={`project-${project.id}`} className="pt-3">
          <h3
            id={`project-${project.id}`}
            title={project.kind === "playground" ? undefined : project.path}
            className="truncate px-2 pb-1 text-2xs font-medium text-muted-foreground"
          >
            {project.kind === "playground" ? t("sessions.playground") : project.name}
          </h3>
          {sessions.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t("sidebar.noSessions")}</p>
          ) : (
            <ul className="flex flex-col gap-px">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link to="/session/$id" params={{ id: session.id }} className={sidebarRow}>
                    <span className="truncate">{session.title ?? t("sessions.untitled")}</span>
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
