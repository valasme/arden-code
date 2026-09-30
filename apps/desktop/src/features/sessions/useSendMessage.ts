import { useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { useCallback } from "react";

import { commands, type TurnEvent } from "@/ipc/bindings";
import { projectsQuery, sessionQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { applyTurnEvent, hasTurn } from "./turnEvents";

/**
 * Sends a message to a session and shows the reply as it streams in. Rust answers with the
 * session as it is when the reply starts, and then sends the reply through a channel; events that
 * arrive before that answer wait for it.
 */
export function useSendMessage(sessionId: string) {
  const queryClient = useQueryClient();

  return useCallback(
    async (text: string) => {
      const key = sessionQuery(sessionId).queryKey;
      const waiting: TurnEvent[] = [];
      const apply = (event: TurnEvent) => {
        queryClient.setQueryData(key, (session) =>
          session && hasTurn(session, event) ? applyTurnEvent(session, event) : session,
        );
      };

      const channel = new Channel<TurnEvent>((event) => {
        if (queryClient.getQueryData(key)?.turns.some((turn) => turn.id === event.turnId)) {
          apply(event);
        } else {
          waiting.push(event);
        }
      });

      try {
        const session = await commands.sendMessage(sessionId, text, channel);
        queryClient.setQueryData(key, session);
        for (const event of waiting.splice(0)) apply(event);
        await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey });
      } catch (error) {
        showErrorToast(toAppError(error));
      }
    },
    [queryClient, sessionId],
  );
}
