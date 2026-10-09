import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { commands, events } from "@/ipc/bindings";
import { usageLimitsQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

/**
 * Keeps the usage limits current (ADR 0043): Rust announces each change Claude Code reports, and
 * the window coming back into focus asks Claude Code again, which Rust does only when the figures
 * are more than 5 minutes old, as the person may have used Claude Code elsewhere. Draws nothing.
 */
export function UsageLimitsSync() {
  const queryClient = useQueryClient();

  useTauriListener(() =>
    events.usageLimitsChanged.listen(({ payload }) => {
      queryClient.setQueryData(usageLimitsQuery.queryKey, payload.limits);
    }),
  );

  useEffect(() => {
    if (!isTauri()) return undefined;
    const askAgain = () => {
      commands.refreshUsageLimits(true).catch(() => {});
    };
    globalThis.addEventListener("focus", askAgain);
    return () => {
      globalThis.removeEventListener("focus", askAgain);
    };
  }, []);

  return null;
}
