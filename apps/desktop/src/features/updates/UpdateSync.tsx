import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { events } from "@/ipc/bindings";
import { updateStatusQuery } from "@/ipc/queries";

/** Keeps the status bar in step with the update: Rust announces every change. Draws nothing. */
export function UpdateSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    events.updateStatusChanged
      .listen(({ payload }) => {
        queryClient.setQueryData(updateStatusQuery.queryKey, payload.status);
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
  }, [queryClient]);

  return null;
}
