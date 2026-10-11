import { createContext } from "react";
import { create } from "zustand";

import { useSettings } from "@/features/settings/useSettings";
import type { TranscriptView } from "@/ipc/bindings";

/** The views, from the least shown to the most (ADR 0051). */
export const transcriptViews = [
  "normal",
  "thinking",
  "verbose",
] as const satisfies readonly TranscriptView[];

/** The transcript view of the session the items are drawn in. */
export const TranscriptViewContext = createContext<TranscriptView>("normal");

interface TranscriptViewsState {
  /** The view of each session that was given its own, by the session's id. */
  views: Partial<Record<string, TranscriptView>>;
  choose: (sessionId: string, view: TranscriptView) => void;
}

/**
 * The views picked from a session's menu (ADR 0051). A session that was not given its own shows the
 * default view from the settings. What was picked lasts while Arden Code runs.
 */
export const useTranscriptViewsStore = create<TranscriptViewsState>()((set) => ({
  views: {},
  choose: (sessionId, view) => {
    set((state) => ({ views: { ...state.views, [sessionId]: view } }));
  },
}));

/** The transcript view a session shows: its own, else the default from the settings. */
export function useTranscriptView(sessionId: string): TranscriptView {
  const own = useTranscriptViewsStore((state) => state.views[sessionId]);
  const fallback = useSettings().appearance.transcriptView;
  return own ?? fallback;
}
