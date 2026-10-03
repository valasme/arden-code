import { create } from "zustand";

import type { AgentKind } from "@/ipc/bindings";

interface RepliesState {
  /** The session that is open, if any. */
  sessionId: string | undefined;
  /** Whether an agent is still answering in it. */
  busy: boolean;
  /** The open session's agent. */
  agent: AgentKind;
  /** Whether the agent waits for the person to answer an approval request. */
  waiting: boolean;
  set: (sessionId: string | undefined, busy: boolean, agent?: AgentKind, waiting?: boolean) => void;
}

/** What the open session is doing, for the commands that act on it, such as stopping a reply. */
export const useRepliesStore = create<RepliesState>((set) => ({
  sessionId: undefined,
  busy: false,
  agent: "demo",
  waiting: false,
  set: (sessionId, busy, agent = "demo", waiting = false) => {
    set({ sessionId, busy, agent, waiting });
  },
}));
