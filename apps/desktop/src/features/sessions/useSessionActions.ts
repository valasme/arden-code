import { useCallback } from "react";

import { useSessionDialogsStore } from "@/state/sessionDialogs";

/** What can be done to a session from its menu, in the order the menu lists them (ADR 0036). */
export const sessionActions = ["rename"] as const;

export type SessionAction = (typeof sessionActions)[number];

/** Runs an action of a session's menu on a session. */
export function useSessionActions(): (action: SessionAction, sessionId: string) => void {
  const rename = useSessionDialogsStore((state) => state.rename);

  return useCallback(
    (action, sessionId) => {
      switch (action) {
        case "rename": {
          rename(sessionId);
          break;
        }
      }
    },
    [rename],
  );
}
