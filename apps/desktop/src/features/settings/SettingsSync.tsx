import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { commands, events } from "@/ipc/bindings";
import { settingsQuery } from "@/ipc/queries";
import { showNoticeToast } from "@/lib/errorToasts";

/**
 * Keeps the settings on screen in step with Rust: a change made anywhere (another part of the UI, or
 * a hand edit of the file) arrives as an event. Also shows the notice for a settings file that could
 * not be used. Draws nothing.
 */
export function SettingsSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    events.settingsChanged
      .listen(({ payload }) => {
        queryClient.setQueryData(settingsQuery.queryKey, payload.settings);
        if (payload.notice) showNoticeToast(payload.notice);
      })
      .then((unlisten) => {
        if (active) stopListening = unlisten;
        else unlisten();
      })
      .catch(() => {});

    // A problem found while starting was waiting for the UI to be ready.
    commands
      .takeSettingsNotice()
      .then((notice) => {
        if (active && notice) showNoticeToast(notice);
      })
      .catch(() => {});

    return () => {
      active = false;
      stopListening?.();
    };
  }, [queryClient]);

  return null;
}
