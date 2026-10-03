import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LinkIcon } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import type { Session, SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";

import { allSessions } from "./sessionList";

/**
 * The sessions the open session is linked with (ADR 0036): the one it was started from, and the ones
 * started from it. Each name opens its session. Nothing shows when there are none.
 */
export function SessionLinks({ session }: { session: Session }) {
  const { t } = useTranslation();
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const sessions = allSessions(list);
  // A session that was deleted is no longer in the list, and its link goes with it.
  const from = sessions.find((other) => other.id === session.linkedFrom);
  const to = sessions.filter((other) => other.linkedFrom === session.id);
  if (from === undefined && to.length === 0) return null;

  const linkTo = (other: SessionSummary) => (
    <Link
      to="/session/$id"
      params={{ id: other.id }}
      className="text-foreground underline underline-offset-2 hover:no-underline"
    >
      {other.title ?? t("sessions.untitled")}
    </Link>
  );

  return (
    <nav
      aria-label={t("sessions.links.label")}
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-5 py-1.5 text-xs text-muted-foreground"
    >
      <LinkIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
      {from ? (
        <p>
          {t("sessions.links.from")} {linkTo(from)}
        </p>
      ) : null}
      {to.length > 0 ? (
        <p>
          {t("sessions.links.to")}{" "}
          {to.map((other, place) => (
            <Fragment key={other.id}>
              {place > 0 ? ", " : null}
              {linkTo(other)}
            </Fragment>
          ))}
        </p>
      ) : null}
    </nav>
  );
}
