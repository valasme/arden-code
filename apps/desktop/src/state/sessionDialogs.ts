import { create } from "zustand";

/** A session that is about to be deleted, once the person confirms it. */
interface Deleting {
  sessionId: string;
  /** Whether it was asked for on the session's row in the sidebar, which then keeps the focus. */
  fromRow: boolean;
}

interface SessionDialogsState {
  /** The session whose rename dialog is open, if one is. */
  renaming: string | undefined;
  /** The session the question about deleting is about, if one is asked. */
  deleting: Deleting | undefined;
  rename: (sessionId: string) => void;
  askToDelete: (deleting: Deleting) => void;
  close: () => void;
}

/** Which dialog of a session's menu is open, and for which session (ADR 0036). */
export const useSessionDialogsStore = create<SessionDialogsState>()((set) => ({
  renaming: undefined,
  deleting: undefined,
  rename: (sessionId) => {
    set({ renaming: sessionId, deleting: undefined });
  },
  askToDelete: (deleting) => {
    set({ renaming: undefined, deleting });
  },
  close: () => {
    set({ renaming: undefined, deleting: undefined });
  },
}));
