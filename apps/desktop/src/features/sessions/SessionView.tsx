import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, EllipsisIcon, FolderIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useCommands } from "@/features/commands/CommandsProvider";
import {
  type Effort,
  type Model,
  type PermissionMode,
  type AgentKind,
  type Answer,
  commands,
  type QuestionAnswer,
} from "@/ipc/bindings";
import { noSessions, sessionListQuery, sessionQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { useRepliesStore } from "@/state/replies";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { agentIcons } from "./agentIcons";
import { AgentMenu } from "./AgentMenu";
import { ArchivedBar } from "./ArchivedBar";
import { MessageBox } from "./MessageBox";
import { EffortMenu } from "./EffortMenu";
import { Figures } from "./Figures";
import { ModelMenu } from "./ModelMenu";
import { PermissionModeMenu } from "./PermissionModeMenu";
import { ProjectMenu } from "./ProjectMenu";
import { projectsByUse } from "./sessionList";
import { useTrustGate } from "./useTrustGate";
import { effortsFor } from "./claudeCatalog";
import { useClaudeCatalog } from "./useClaudeCatalog";
import { useHandledSlashCommands } from "./useHandledSlashCommands";
import { useUltrathink } from "./ultrathink";
import { useUnavailableAgents } from "./useUnavailableAgents";
import { ReplyAnnouncer } from "./ReplyAnnouncer";
import { SessionLinks } from "./SessionLinks";
import { SessionMenu } from "./SessionMenu";
import { TurnView } from "./TurnView";
import { useOpenFolder } from "./useOpenFolder";
import { useSendMessage } from "./useSendMessage";
import { waitingRequest } from "./waiting";

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
  const queryClient = useQueryClient();
  const send = useSendMessage();
  const openFolder = useOpenFolder();
  const unavailable = useUnavailableAgents();
  const transcript = useRef<HTMLElement>(null);
  const stuck = useRef(true);
  /** Where the view was last held at the end. Only a scroll above it is the person leaving the end. */
  const heldAt = useRef(0);
  const [atEnd, setAtEnd] = useState(true);
  const { gate, dialog: trustDialog } = useTrustGate();
  const { ultrathink, setUltrathink, carrying } = useUltrathink();

  const turns = session?.turns ?? [];
  const count = turns.length;
  const lastTurn = turns.at(-1);
  const busy = turns.some((turn) => turn.status === "running");
  const agent = session?.agent ?? "demo";
  const catalog = useClaudeCatalog(agent === "claude");
  const runHandled = useHandledSlashCommands();
  const waiting = waitingRequest(lastTurn) !== undefined;

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
    setReplies(id, busy, agent, waiting);
    return () => {
      setReplies(undefined, false);
    };
  }, [id, busy, agent, waiting, setReplies]);

  // The same function for every render, so the turns that did not change are not drawn again.
  const answer = useCallback(
    (itemId: string, given: Answer) => {
      commands.answerApproval(id, itemId, given).catch((failure: unknown) => {
        showErrorToast(toAppError(failure));
      });
    },
    [id],
  );
  const answerQuestions = useCallback(
    (itemId: string, given: QuestionAnswer[]) => {
      commands.answerQuestions(id, itemId, given).catch((failure: unknown) => {
        showErrorToast(toAppError(failure));
      });
    },
    [id],
  );

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
  const projectName =
    project === undefined || project.kind === "playground"
      ? t("sessions.playground")
      : project.name;
  const agentName = t(`agents.${agent}.name`);
  /** Makes a change to the session, then reads it again, and the sidebar's list when it moved. */
  const change = (made: Promise<null>, listToo: boolean) => {
    made
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: sessionQuery(id).queryKey });
        if (listToo) await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
      })
      .catch((failure: unknown) => {
        showErrorToast(toAppError(failure));
      });
  };
  // While the session has had no message, its agent and project can still change (ADR 0039).
  const chooseAgent = (chosen: AgentKind) => {
    change(commands.setSessionAgent(id, chosen), true);
  };
  const chooseProject = (projectId: string) => {
    change(commands.setSessionProject(id, projectId), true);
  };
  // The model and effort can change between messages, for Claude only (ADR 0041).
  const chooseModel = (model: Model | null) => {
    change(commands.setSessionModel(id, model), false);
  };
  const chooseEffort = (effort: Effort | null) => {
    change(commands.setSessionEffort(id, effort), false);
  };
  // The permission mode changes at once, also while a reply runs (ADR 0044).
  const chooseMode = (mode: PermissionMode) => {
    change(commands.setSessionPermissionMode(id, mode), false);
  };
  // /rename names the session, and asks for a name when it is given none (ADR 0042).
  const renameTo = (name: string) => {
    if (name === "") {
      useSessionDialogsStore.getState().rename(id);
      return;
    }
    commands
      .renameSession(id, name)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: sessionQuery(id).queryKey });
        await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
      })
      .catch((failure: unknown) => {
        showErrorToast(toAppError(failure));
      });
  };
  // Once the session has a message, its agent and project can no longer change: they are named in
  // the header, and the lower line keeps only what the next message can change (ADR 0044).
  const choices = (
    <>
      {count === 0 ? (
        <>
          <AgentMenu agent={agent} unavailable={unavailable} onChoose={chooseAgent} />
          <ProjectMenu
            projectId={session.projectId}
            projects={projectsByUse(list)}
            onChoose={chooseProject}
            onOpenFolder={() => {
              void openFolder().then((opened) => {
                if (opened) chooseProject(opened.id);
              });
            }}
          />
        </>
      ) : null}
      {agent === "claude" ? (
        <>
          <ModelMenu
            model={session.model ?? null}
            models={catalog.models}
            disabled={busy}
            onChoose={chooseModel}
          />
          <EffortMenu
            effort={session.effort ?? null}
            levels={effortsFor(catalog, session.model ?? null)}
            disabled={busy}
            ultrathink={ultrathink}
            onUltrathink={setUltrathink}
            onChoose={chooseEffort}
          />
          <PermissionModeMenu mode={session.permissionMode ?? "manual"} onChoose={chooseMode} />
        </>
      ) : null}
    </>
  );
  const AgentIcon = agentIcons[agent];

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-5">
        <h1 className="min-w-0 truncate text-sm font-semibold">
          {session.title ?? t("sessions.untitled")}
        </h1>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <AgentIcon aria-hidden className="size-4" strokeWidth={1.5} />
          {agentName}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FolderIcon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{projectName}</span>
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
      <SessionLinks session={session} />
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
              {t(`agents.${agent}.empty`)}
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
                    <TurnView
                      turn={turn}
                      agent={agent}
                      onAnswer={answer}
                      onAnswerQuestions={answerQuestions}
                    />
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
      <ReplyAnnouncer turn={lastTurn} agent={agent} />
      {session.archivedAt === null ? (
        <MessageBox
          agent={agent}
          busy={busy}
          choices={choices}
          figures={
            agent === "claude" ? <Figures contextWindow={session.contextWindow ?? null} /> : null
          }
          onStop={() => {
            run("reply.stop");
          }}
          {...(agent === "claude"
            ? {
                slash: { commands: catalog.commands, terminalCommands: catalog.terminalCommands },
                ultrathink: {
                  on: ultrathink,
                  onTurnOff: () => {
                    setUltrathink(false);
                  },
                },
              }
            : {})}
          onSend={carrying((text) => {
            if (
              agent === "claude" &&
              runHandled(text, {
                catalog,
                chooseModel,
                chooseEffort,
                rename: renameTo,
                clear: () => {
                  run("session.new");
                },
              })
            ) {
              return true;
            }
            stuck.current = true;
            setAtEnd(true);
            return gate(agent, project, () => {
              void send(id, text);
              return true;
            });
          })}
        />
      ) : (
        <ArchivedBar sessionId={id} />
      )}
      {trustDialog}
    </div>
  );
}
