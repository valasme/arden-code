import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useCommands } from "@/features/commands/CommandsProvider";
import { useFormatters } from "@/features/settings/useFormatters";
import type { Turn } from "@/ipc/bindings";
import { sessionQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";

import { ItemView } from "./items/ItemView";
import { MessageBox } from "./MessageBox";
import { useSendMessage } from "./useSendMessage";

/** How close to the end the person must be for new text to keep the end in view. */
const STICK_DISTANCE = 80;

function TurnView({ turn }: { turn: Turn }) {
  const { t } = useTranslation();
  const formatters = useFormatters();
  const time = new Date(turn.startedAt);

  return (
    <article className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div>
        <h3 className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
          {t("sessions.you")}
          <time dateTime={turn.startedAt} className="font-normal">
            {formatters.dateTime(time)}
          </time>
        </h3>
        <p className="mt-1 text-sm whitespace-pre-wrap">{turn.prompt}</p>
      </div>
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">{t("sessions.demoAgent")}</h3>
        {turn.items.map((item) => (
          <ItemView key={item.id} item={item} streaming={turn.status === "running"} />
        ))}
        {turn.status === "running" ? (
          <output className="mt-1 block text-xs text-muted-foreground">
            {t("sessions.replying")}
          </output>
        ) : null}
        {turn.status === "failed" ? (
          <p className="mt-1 text-xs text-destructive">{t("sessions.stopped")}</p>
        ) : null}
      </div>
    </article>
  );
}

/** A conversation: the turns so far, and the box to write the next message in. */
export function SessionView({ id }: { id: string }) {
  const { t } = useTranslation();
  const { run } = useCommands();
  const { data: session, error } = useQuery(sessionQuery(id));
  const send = useSendMessage(id);
  const transcript = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const busy = session?.turns.some((turn) => turn.status === "running") ?? false;

  // Follow the reply while the person is at the end of it; leave them alone once they scroll up.
  useEffect(() => {
    const element = transcript.current;
    if (element && stuck.current) element.scrollTop = element.scrollHeight;
    // The session is not read here: any change of it, such as more text, is the reason to run.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [session]);

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline gap-3 border-b border-border px-6 py-3">
        <h1 className="min-w-0 truncate text-sm font-semibold">
          {session.title ?? t("sessions.untitled")}
        </h1>
        <span className="shrink-0 border border-border px-1.5 text-2xs text-muted-foreground">
          {t("sessions.demoAgent")}
        </span>
      </header>
      <main
        ref={transcript}
        aria-label={t("sessions.transcript")}
        aria-busy={busy}
        className="min-h-0 flex-1 overflow-auto px-6"
        onScroll={(event) => {
          const element = event.currentTarget;
          stuck.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < STICK_DISTANCE;
        }}
      >
        {session.turns.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{t("sessions.empty")}</p>
        ) : (
          session.turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
        )}
      </main>
      <MessageBox
        busy={busy}
        onSend={(text) => {
          stuck.current = true;
          void send(text);
        }}
      />
    </div>
  );
}
