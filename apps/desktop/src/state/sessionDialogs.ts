import { create } from "zustand";

interface SessionDialogsState {
  /** The session whose rename dialog is open, if one is. */
  renaming: string | undefined;
  rename: (sessionId: string) => void;
  close: () => void;
}

/** Which dialog of a session's menu is open, and for which session (ADR 0036). */
export const useSessionDialogsStore = create<SessionDialogsState>()((set) => ({
  renaming: undefined,
  rename: (sessionId) => {
    set({ renaming: sessionId });
  },
  close: () => {
    set({ renaming: undefined });
  },
}));
