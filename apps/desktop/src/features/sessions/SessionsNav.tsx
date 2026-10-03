import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, SquarePenIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { ShortcutHint } from "@/components/layout/ShortcutHint";
import { sidebarRow } from "@/components/layout/sidebarRow";
import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useCommands } from "@/features/commands/CommandsProvider";
import type { SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { cn } from "@/lib/utils";
import { useRowFocusStore } from "@/state/rowFocus";

import { SessionMenu } from "./SessionMenu";

/**
 * A session in the sidebar: a link that opens it, and at its end the button of its menu (ADR 0036).
 * The button shows while the row is pointed at or has the focus, and stays out of the Tab order:
 * the keyboard opens the same menu with Shift+F10 or the Menu key on the row.
 */
function SessionRow({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const title = session.title ?? t("sessions.untitled");
  const link = useRef<HTMLAnchorElement>(null);

  // The row takes the focus that was asked for it, once it stands in the list it was asked for: the
  // row a pin moved away from is not this one.
  const request = useRowFocusStore((state) => state.request);
  const done = useRowFocusStore((state) => state.done);
  useEffect(() => {
    if (request?.sessionId !== session.id || request.pinned !== session.pinned) return;
    link.current?.focus();
    done();
  }, [request, session.id, session.pinned, done]);

  return (
    <li data-session-id={session.id} className="group/row relative">
      <Link
        ref={link}
        to="/session/$id"
        params={{ id: session.id }}
        className={cn(sidebarRow, "pe-8")}
      >
        <span className="truncate">{title}</span>
      </Link>
      <SessionMenu sessionId={session.id} onRow>
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("sessions.menu.label", { title })}
          className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-sidebar-border hover:text-sidebar-accent-foreground data-[state=open]:opacity-100 forced-colors:hover:outline forced-colors:hover:outline-1"
        >
          <EllipsisIcon aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
      </SessionMenu>
    </li>
  );
}

/** A label over a list of sessions, like a project's name. */
const sectionLabel = "truncate px-2 pb-1 text-2xs font-medium text-muted-foreground";

/**
 * The button that starts a new session, the pinned sessions, and the projects with their other
 * sessions (ADR 0036). A folder project with no sessions in its list is left out; the Playground is
 * always there, since New session starts there.
 */
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
      {list.pinned.length > 0 ? (
        <section aria-labelledby="sessions-pinned" className="pt-3">
          <h2 id="sessions-pinned" className={sectionLabel}>
            {t("sidebar.pinned")}
          </h2>
          <ul className="flex flex-col gap-px">
            {list.pinned.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        </section>
      ) : null}
      <h2 className="sr-only">{t("sidebar.projects")}</h2>
      {list.projects
        .filter(({ project, sessions }) => project.kind === "playground" || sessions.length > 0)
        .map(({ project, sessions }) => (
          <section key={project.id} aria-labelledby={`project-${project.id}`} className="pt-3">
            <h3
              id={`project-${project.id}`}
              title={project.kind === "playground" ? undefined : project.path}
              className={sectionLabel}
            >
              {project.kind === "playground" ? t("sessions.playground") : project.name}
            </h3>
            {sessions.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("sidebar.noSessions")}</p>
            ) : (
              <ul className="flex flex-col gap-px">
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
          </section>
        ))}
    </>
  );
}
