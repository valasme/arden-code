import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { events } from "@/ipc/bindings";
import { systemPreferencesQuery } from "@/ipc/queries";

/**
 * Keeps the Windows text size and regional format on screen in step with Windows: Rust notices a
 * change and sends it as an event. Draws nothing.
 */
export function SystemPreferencesSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    events.systemPreferencesChanged
      .listen(({ payload }) => {
        queryClient.setQueryData(systemPreferencesQuery.queryKey, payload.preferences);
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
