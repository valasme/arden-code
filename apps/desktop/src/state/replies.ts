import { create } from "zustand";

interface RepliesState {
  /** The session that is open, if any. */
  sessionId: string | undefined;
  /** Whether an agent is still answering in it. */
  busy: boolean;
  set: (sessionId: string | undefined, busy: boolean) => void;
}

/** What the open session is doing, for the commands that act on it, such as stopping a reply. */
export const useRepliesStore = create<RepliesState>((set) => ({
  sessionId: undefined,
  busy: false,
  set: (sessionId, busy) => {
    set({ sessionId, busy });
  },
}));
