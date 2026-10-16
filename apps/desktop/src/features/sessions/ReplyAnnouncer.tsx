import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AgentKind, Turn } from "@/ipc/bindings";

import { ANNOUNCE_INTERVAL_MS, finalAnnouncement, nextAnnouncement } from "./announce";
import { waitingRequest } from "./waiting";

/** What the agent has said in a turn in words, without thinking, tool calls or file changes. */
function spokenText(turn: Turn): string {
  return turn.items.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n\n");
}

/**
 * Tells screen readers about a reply as it streams. The text on the screen is not a live region:
 * it changes with every word, and a screen reader would talk over itself. Instead this says the
 * complete sentences that arrived, at most once every few seconds, politely (it waits for the
 * screen reader to finish what it is saying), and says when the reply is over. An approval request
 * is said at once, as the agent waits for it (ADR 0039).
 */
export function ReplyAnnouncer({ turn, agent }: { turn: Turn | undefined; agent: AgentKind }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const turnId = turn?.id;
  const status = turn?.status;

  // The interval and the end of the reply read the newest text without restarting on every word.
  const latest = useRef(turn);
  useEffect(() => {
    latest.current = turn;
  });
  const spoken = useRef({ turnId: "", length: 0 });

  const running = status === "running";
  useEffect(() => {
    if (!running || turnId === undefined) return undefined;
    spoken.current = { turnId, length: 0 };
    const timer = setInterval(() => {
      const current = latest.current;
      if (current?.id !== turnId) return;
      const next = nextAnnouncement(spokenText(current), spoken.current.length);
      if (next.say === "") return;
      spoken.current = { turnId, length: next.spoken };
      setMessage(next.say);
    }, ANNOUNCE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [running, turnId]);

  // A request or questions that start waiting are said at once: the agent can do nothing until
  // they are answered.
  const request = waitingRequest(turn);
  const requestId = request?.id;
  useEffect(() => {
    const name = t(`agents.${agent}.name`);
    if (request?.type === "approval") {
      const asks = t(`items.approval.asks.${request.action}`, { agent: name });
      setMessage(`${asks}: ${request.subject}`);
    }
    if (request?.type === "questions") {
      const asked = request.questions.map((question) => question.question).join(" ");
      setMessage(`${t("items.questions.asks", { agent: name })}: ${asked}`);
    }
    if (request?.type === "plan") setMessage(t("items.plan.asks", { agent: name }));
    // Said once, when the request arrives.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // When the reply ends, the rest of it is said, and then that it is over.
  useEffect(() => {
    if (turnId === undefined || status === undefined || status === "running") return;
    if (spoken.current.turnId !== turnId) return;
    const current = latest.current;
    const rest = current ? finalAnnouncement(spokenText(current), spoken.current.length) : "";
    const ending = t(`sessions.announce.${status}`);
    setMessage(rest === "" ? ending : `${rest} ${ending}`);
    spoken.current = { turnId: "", length: 0 };
  }, [status, turnId, t]);

  return (
    <output aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </output>
  );
}
