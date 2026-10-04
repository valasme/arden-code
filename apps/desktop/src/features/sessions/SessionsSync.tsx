import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent } from "react";

import { commands, events } from "@/ipc/bindings";
import { agentsQuery, newSessionAgentQuery, sessionListQuery } from "@/ipc/queries";
import { showNoticeToast } from "@/lib/errorToasts";
import { useTauriListener } from "@/lib/useTauriListener";

/**
 * Keeps the page in step with what Rust did with the sessions on its own. It shows the session Rust
 * made for a folder that was opened, for example by the `arden-code` terminal command: the one that
 * was waiting when the page came up, and any that come later. It also shows the notice for a
 * sessions file that could not be used, or a reply that could not be saved in it (ADR 0035). Draws
 * nothing.
 */
export function SessionsSync() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const show = useEffectEvent((id: string) => {
    queryClient
      .invalidateQueries({ queryKey: sessionListQuery.queryKey })
      .then(() => navigate({ to: "/session/$id", params: { id } }))
      .catch(() => {});
  });

  useTauriListener(() =>
    events.sessionRequested.listen(({ payload }) => {
      show(payload.sessionId);
    }),
  );

  // What Rust found about the agent programs after it started can change the agent of a new
  // session (ADR 0039).
  useTauriListener(() =>
    events.agentsDetected.listen(({ payload }) => {
      queryClient.setQueryData(agentsQuery.queryKey, payload.detections);
      queryClient.invalidateQueries({ queryKey: newSessionAgentQuery.queryKey }).catch(() => {});
    }),
  );

  // A reply that could not be written to the sessions file is still shown, until the app closes.
  useTauriListener(() =>
    events.replyNotSaved.listen(({ payload }) => {
      showNoticeToast(payload.notice);
    }),
  );

  // A folder opened before the page was ready left its session waiting, and a problem with the
  // sessions file found while starting waited for the page too.
  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    commands
      .takePendingOpen()
      .then((id) => {
        if (id !== null && active) show(id);
      })
      .catch(() => {});
    commands
      .takeSessionsNotice()
      .then((notice) => {
        if (notice && active) showNoticeToast(notice);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return null;
}
