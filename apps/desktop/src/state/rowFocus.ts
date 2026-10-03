import { create } from "zustand";

/** A session's row that should take the focus once it stands where it is asked for. */
interface RowFocusRequest {
  sessionId: string;
  /** Whether the row is to be found among the pinned sessions or in its project. */
  pinned: boolean;
}

interface RowFocusState {
  request: RowFocusRequest | undefined;
  focusRow: (request: RowFocusRequest) => void;
  done: () => void;
}

/**
 * Keeps the focus with a session's row in the sidebar when the row moves to the other list (ADR
 * 0036): the row the focus was on goes away, and the session's row in its new place takes the focus
 * when it is drawn there.
 */
export const useRowFocusStore = create<RowFocusState>()((set) => ({
  request: undefined,
  focusRow: (request) => {
    set({ request });
  },
  done: () => {
    set({ request: undefined });
  },
}));
