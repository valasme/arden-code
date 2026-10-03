import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, EllipsisIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useCommands } from "@/features/commands/CommandsProvider";
import { commands } from "@/ipc/bindings";
import { noSessions, sessionListQuery, sessionQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { useRepliesStore } from "@/state/replies";

import { MessageBox } from "./MessageBox";
import { ReplyAnnouncer } from "./ReplyAnnouncer";
import { SessionMenu } from "./SessionMenu";
import { TurnView } from "./TurnView";
import { useSendMessage } from "./useSendMessage";

/** How close to the end the person must be for new text to keep the end in view. */
const STICK_DISTANCE = 80;
/** A guess at the height of a message, until it is drawn and measured. */
const ESTIMATED_HEIGHT = 180;
/** How many messages beyond the visible ones are drawn, so a scroll never shows a gap. */
const OVERSCAN = 6;

/**
 * The session view: the session's turns so far, and the message box. Only the messages
 * that are on the screen are drawn, so a session of thousands of messages scrolls as easily as a
 * short one. While a reply streams, the view follows it as long as the person is at the end; once
 * they scroll up it stays where they put it, and "Jump to latest" brings them back.
 */
export function SessionView({ id }: { id: string }) {
  const { t } = useTranslation();
  const { run } = useCommands();
  const { data: session, error } = useQuery(sessionQuery(id));
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const send = useSendMessage();
  const transcript = useRef<HTMLElement>(null);
  const stuck = useRef(true);
  /** Where the view was last held at the end. Only a scroll above it is the person leaving the end. */
  const heldAt = useRef(0);
  const [atEnd, setAtEnd] = useState(true);

  const turns = session?.turns ?? [];
  const count = turns.length;
  const lastTurn = turns.at(-1);
  const busy = turns.some((turn) => turn.status === "running");

  // The virtualizer's functions cannot be memoized, so the compiler leaves this component alone.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => transcript.current,
    estimateSize: () => ESTIMATED_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (index) => turns[index]?.id ?? index,
  });

  // The commands that act on the open session, such as stopping its reply, need to know about it.
  const setReplies = useRepliesStore((state) => state.set);
  useEffect(() => {
    setReplies(id, busy);
    return () => {
      setReplies(undefined, false);
    };
  }, [id, busy, setReplies]);

  const scrollToEnd = () => {
    stuck.current = true;
    setAtEnd(true);
    if (count > 0) virtualizer.scrollToIndex(count - 1, { align: "end" });
  };

  const loaded = session !== undefined;

  // The session opens again at the next start, when the person asked for that (ADR 0036).
  useEffect(() => {
    if (!loaded) return;
    commands.rememberOpenSession(id).catch((failure: unknown) => {
      const { code } = toAppError(failure);
      logger.warn("sessions", "the open session could not be remembered", code);
    });
  }, [id, loaded]);

  // A session opens at its end.
  useEffect(() => {
    if (loaded && count > 0) virtualizer.scrollToIndex(count - 1, { align: "end" });
    // Only when the session has arrived: after that the effect below follows the reply.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // A reply that grows, or a new message, keeps the end in view while the person is at the end;
  // a person who scrolled up is left alone.
  const total = virtualizer.getTotalSize();
  useEffect(() => {
    const element = transcript.current;
    if (!element || !stuck.current || count === 0) return;
    element.scrollTop = element.scrollHeight;
    heldAt.current = element.scrollTop;
    // The size is not read here: a message that grows is the reason to run.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [count, total]);

  if (error) {
    const { code } = toAppError(error);
    return (
      <main className="flex h-full flex-col items-start gap-3 p-6">
        <h1 className="text-xl font-semibold">{t(`errors.${code}.what`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`errors.${code}.action`)}</p>
        <Button
          variant="outline"
          onClick={() => {
            run("session.new");
          }}
        >
          {t("sessions.new")}
        </Button>
      </main>
    );
  }
  if (!session) return null;

  const project = list.projects.find(
    (listing) => listing.project.id === session.projectId,
  )?.project;
  const context = t("sessions.context", {
    agent: t("sessions.demoAgent"),
    project:
      project === undefined || project.kind === "playground"
        ? t("sessions.playground")
        : project.name,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-5">
        <h1 className="min-w-0 truncate text-sm font-semibold">
          {session.title ?? t("sessions.untitled")}
        </h1>
        <span className="shrink-0 border border-border px-1.5 text-2xs leading-4 text-muted-foreground">
          {t("sessions.demoAgent")}
        </span>
        <SessionMenu sessionId={id}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ms-auto"
            aria-label={t("sessions.menu.open")}
          >
            <EllipsisIcon aria-hidden className="size-4" strokeWidth={1.5} />
          </Button>
        </SessionMenu>
      </header>
      <div className="relative min-h-0 flex-1">
        <main
          ref={transcript}
          aria-label={t("sessions.transcript")}
          aria-busy={busy}
          // A region that scrolls must be reachable by keyboard, to scroll it with the arrow keys.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="absolute inset-0 overflow-auto px-6"
          onScroll={(event) => {
            const element = event.currentTarget;
            const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
            // A reply can grow between the view moving to the end and the browser reporting that
            // scroll, so the end may already be far away by then. The person has left the end only
            // when the view moved up, away from where it was held.
            const movedUp = element.scrollTop < heldAt.current - STICK_DISTANCE;
            stuck.current = distance < STICK_DISTANCE || (stuck.current && !movedUp);
            if (stuck.current) heldAt.current = Math.max(heldAt.current, element.scrollTop);
            setAtEnd(stuck.current);
          }}
        >
          {count === 0 ? (
            <p className="mx-auto max-w-[45rem] py-6 text-sm text-muted-foreground">
              {t("sessions.empty")}
            </p>
          ) : (
            <div
              role="feed"
              aria-label={t("sessions.messages")}
              className="relative mx-auto w-full max-w-[45rem]"
              style={{ height: total }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const turn = turns[row.index];
                if (!turn) return null;
                return (
                  <article
                    key={row.key}
                    ref={virtualizer.measureElement}
                    data-index={row.index}
                    aria-posinset={row.index + 1}
                    aria-setsize={count}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${row.start}px)` }}
                  >
                    <TurnView turn={turn} />
                  </article>
                );
              })}
            </div>
          )}
        </main>
        {atEnd ? null : (
          <Button
            variant="outline"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background shadow-sm"
            onClick={scrollToEnd}
          >
            <ArrowDownIcon aria-hidden className="size-4" strokeWidth={1.5} />
            {t("sessions.jumpToLatest")}
          </Button>
        )}
      </div>
      <ReplyAnnouncer turn={lastTurn} />
      <MessageBox
        busy={busy}
        context={context}
        onStop={() => {
          run("reply.stop");
        }}
        onSend={(text) => {
          stuck.current = true;
          setAtEnd(true);
          void send(id, text);
          return true;
        }}
      />
    </div>
  );
}
