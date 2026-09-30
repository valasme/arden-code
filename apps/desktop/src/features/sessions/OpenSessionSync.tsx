import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { commands, events } from "@/ipc/bindings";
import { projectsQuery } from "@/ipc/queries";

/**
 * Shows the session Rust made for a folder that was opened, for example by the `arden-code`
 * terminal command: the one that was waiting when the page came up, and any that come later.
 * Draws nothing.
 */
export function OpenSessionSync() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    const show = (id: string) => {
      queryClient
        .invalidateQueries({ queryKey: projectsQuery.queryKey })
        .then(() => navigate({ to: "/session/$id", params: { id } }))
        .catch(() => {});
    };

    commands
      .takePendingOpen()
      .then((id) => {
        if (id !== null && active) show(id);
      })
      .catch(() => {});
    events.sessionRequested
      .listen(({ payload }) => {
        show(payload.sessionId);
      })
      .then((unlisten) => {
        if (active) stopListening = unlisten;
        else unlisten();
      })
      .catch(() => {});

    return () => {
      active = false;
      stopListening?.();
    };
  }, [queryClient, navigate]);

  return null;
}
