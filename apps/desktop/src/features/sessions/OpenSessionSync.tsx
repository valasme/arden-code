import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent } from "react";

import { commands, events } from "@/ipc/bindings";
import { projectsQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

/**
 * Shows the session Rust made for a folder that was opened, for example by the `arden-code`
 * terminal command: the one that was waiting when the page came up, and any that come later.
 * Draws nothing.
 */
export function OpenSessionSync() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const show = useEffectEvent((id: string) => {
    queryClient
      .invalidateQueries({ queryKey: projectsQuery.queryKey })
      .then(() => navigate({ to: "/session/$id", params: { id } }))
      .catch(() => {});
  });

  useTauriListener(() =>
    events.sessionRequested.listen(({ payload }) => {
      show(payload.sessionId);
    }),
  );

  // A folder opened before the page was ready left its session waiting.
  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    commands
      .takePendingOpen()
      .then((id) => {
        if (id !== null && active) show(id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return null;
}
