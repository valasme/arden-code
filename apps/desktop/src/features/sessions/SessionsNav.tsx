import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, SquarePenIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { ShortcutHint } from "@/components/layout/ShortcutHint";
import { sidebarRow } from "@/components/layout/sidebarRow";
import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useCommands } from "@/features/commands/CommandsProvider";
import type { SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { listRow, listSection } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useRowFocusStore } from "@/state/rowFocus";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { ProjectActionsMenu } from "./ProjectActions";
import { SessionMenu } from "./SessionMenu";
import { useSessionActions } from "./useSessionActions";

/**
 * Props for a row or a section on its way out of the sidebar: from its first frame, it cannot be
 * reached and a screen reader no longer reads it, while it fades out. The focus has already moved
 * on to the next row (plan section 6.11).
 */
function useLeaving() {
  const present = useIsPresent();
  return { inert: !present, "aria-hidden": present ? undefined : true } as const;
}

/**
 * A session in the sidebar: a link that opens it, and at its end the button of its menu (ADR 0036).
 * The button shows while the row is pointed at or has the focus, and stays out of the Tab order:
 * the keyboard opens the same menu with Shift+F10 or the Menu key on the row.
 */
function SessionRow({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const title = session.title ?? t("sessions.untitled");
  const link = useRef<HTMLAnchorElement>(null);
  const runAction = useSessionActions();
  const leaving = useLeaving();

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
    <m.li
      {...listRow}
      {...leaving}
      layoutId={`session-row-${session.id}`}
      data-session-id={session.id}
      className="group/row relative"
    >
      <Link
        ref={link}
        to="/session/$id"
        params={{ id: session.id }}
        className={cn(sidebarRow, "pe-8")}
        // Delete asks to delete the session, as it does for a file in File Explorer.
        onKeyDown={(event) => {
          const plain = !(event.ctrlKey || event.altKey || event.shiftKey || event.metaKey);
          if (event.key !== "Delete" || !plain) return;
          event.preventDefault();
          runAction("delete", session.id, true);
        }}
      >
        <span className="truncate">{title}</span>
      </Link>
      <SessionMenu sessionId={session.id} onRow>
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("sessions.menu.label", { title })}
          className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-sidebar-border hover:text-sidebar-accent-foreground data-[state=open]:opacity-100"
        >
          <EllipsisIcon aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
      </SessionMenu>
    </m.li>
  );
}

/**
 * The rows of a list of sessions. The list stays while its last row fades out, then hides once it is
 * empty, and a note after it can show in its place (`peer`).
 */
function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <ul className="peer flex flex-col gap-px empty:hidden">
      <AnimatePresence initial={false}>
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/**
 * Pinned, or a project, with its sessions under its name. It leaves whole, its name fading out with
 * its last rows, when nothing is pinned any more, or its project is removed or has no sessions left
 * in its list.
 */
function SessionsSection({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const leaving = useLeaving();

  return (
    <m.section {...listSection} {...leaving} aria-labelledby={labelledBy} className="pt-3">
      {children}
    </m.section>
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
  const askToRemove = useSessionDialogsStore((state) => state.askToRemove);

  return (
    // Rows and sections move together, so a row that slides into Pinned moves what is below it too.
    <LayoutGroup>
      <CommandTooltip command="session.new">
        <button
          type="button"
          data-new-session
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
      <AnimatePresence initial={false}>
        {list.pinned.length > 0 ? (
          <SessionsSection key="pinned" labelledBy="sessions-pinned">
            <h2 id="sessions-pinned" className={sectionLabel}>
              {t("sidebar.pinned")}
            </h2>
            <SessionList sessions={list.pinned} />
          </SessionsSection>
        ) : null}
      </AnimatePresence>
      <h2 className="sr-only">{t("sidebar.projects")}</h2>
      <AnimatePresence initial={false}>
        {list.projects
          .filter(({ project, sessions }) => project.kind === "playground" || sessions.length > 0)
          .map(({ project, sessions }) => (
            <SessionsSection key={project.id} labelledBy={`project-${project.id}`}>
              {project.kind === "playground" ? (
                <h3 id={`project-${project.id}`} className={sectionLabel}>
                  {t("sessions.playground")}
                </h3>
              ) : (
                // A right click on the name opens the project's menu too (ContextMenuHost). Unlike a
                // session's, the … button stays in the Tab order: the name itself takes no focus.
                <div data-project-id={project.id} className="group/project relative">
                  <h3
                    id={`project-${project.id}`}
                    title={project.path}
                    className={cn(sectionLabel, "pe-8")}
                  >
                    {project.name}
                  </h3>
                  <ProjectActionsMenu
                    onRemove={() => {
                      askToRemove(project.id);
                    }}
                  >
                    <button
                      type="button"
                      aria-label={t("projects.menu", { name: project.name })}
                      className="absolute end-1 -top-1 grid size-6 place-items-center rounded-sm text-muted-foreground opacity-0 group-focus-within/project:opacity-100 group-hover/project:opacity-100 hover:bg-sidebar-border hover:text-sidebar-accent-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <EllipsisIcon aria-hidden className="size-4" strokeWidth={1.5} />
                    </button>
                  </ProjectActionsMenu>
                </div>
              )}
              <SessionList sessions={sessions} />
              {sessions.length === 0 ? (
                // Shown once the list before it is empty, after its last row has faded out.
                <p className="hidden px-2 py-1 text-xs text-muted-foreground peer-empty:block">
                  {t("sidebar.noSessions")}
                </p>
              ) : null}
            </SessionsSection>
          ))}
      </AnimatePresence>
    </LayoutGroup>
  );
}
