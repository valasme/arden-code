import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useFormatters } from "@/features/settings/useFormatters";
import { noSessions, sessionListQuery } from "@/ipc/queries";

import { useSessionActions } from "./useSessionActions";

/**
 * The archived sessions (ADR 0036), the last archived first, each with its project, the date it was
 * archived, Unarchive and Delete. Opening one shows it read-only. When a row leaves the list while
 * the focus is on it, the focus goes to the row that takes its place, or else the one before, or the
 * page's title.
 */
export function ArchivedSessions() {
  const { t } = useTranslation();
  const { date } = useFormatters();
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const runAction = useSessionActions();
  const rows = useRef<HTMLUListElement>(null);
  const page = useRef<HTMLElement>(null);
  /** The row that last had the focus, by its place in the list. */
  const lastFocused = useRef<number | undefined>(undefined);

  const projectName = (projectId: string) => {
    const project = list.projects.find((listing) => listing.project.id === projectId)?.project;
    return project === undefined || project.kind === "playground"
      ? t("sessions.playground")
      : project.name;
  };

  const { archived } = list;
  useEffect(() => {
    const focused = document.activeElement;
    const place = lastFocused.current;
    if ((focused !== null && focused !== document.body) || place === undefined) return;
    const items = rows.current?.querySelectorAll<HTMLElement>("li") ?? [];
    const item = items[Math.min(place, items.length - 1)];
    const target =
      item?.querySelector<HTMLElement>("button") ?? page.current?.querySelector<HTMLElement>("h1");
    target?.focus();
    // The list is not read here: a list that changed is the reason to run.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [archived]);

  return (
    <main ref={page} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[40rem] px-6 pt-8 pb-12">
        <PageHeader
          title={t("sessions.archived.title")}
          description={t("sessions.archived.description")}
          focusable
        />
        {archived.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sessions.archived.empty")}</p>
        ) : (
          <ul
            ref={rows}
            aria-label={t("sessions.archived.title")}
            className="divide-y divide-border border border-border"
          >
            {archived.map((session, place) => {
              const titleId = `archived-${session.id}`;
              const remember = () => {
                lastFocused.current = place;
              };
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
                    <Link
                      id={titleId}
                      to="/session/$id"
                      params={{ id: session.id }}
                      className="truncate text-sm font-medium hover:underline"
                      onFocus={remember}
                    >
                      {session.title ?? t("sessions.untitled")}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t("sessions.archived.line", {
                        project: projectName(session.projectId),
                        date: session.archivedAt ? date(new Date(session.archivedAt)) : "",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-describedby={titleId}
                      onFocus={remember}
                      onClick={() => {
                        runAction("unarchive", session.id);
                      }}
                    >
                      {t("sessions.archived.unarchive")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-describedby={titleId}
                      onFocus={remember}
                      onClick={() => {
                        runAction("delete", session.id);
                      }}
                    >
                      {t("sessions.actions.delete")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
