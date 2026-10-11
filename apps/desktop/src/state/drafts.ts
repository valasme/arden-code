import { create } from "zustand";

import type { AgentKind, Effort, Model, PermissionMode } from "@/ipc/bindings";

/** Whose draft the welcome state's message box holds, beside the sessions', kept by their id. */
export const WELCOME_DRAFT = "welcome";

/**
 * What the welcome state's menus were set to. A menu the person has not touched is absent, and a
 * session started there takes what it would inherit (ADR 0041). A model or an effort of `null` is
 * Default, chosen.
 */
export interface WelcomeChoices {
  agent?: AgentKind;
  projectId?: string;
  model?: Model | null;
  effort?: Effort | null;
  permissionMode?: PermissionMode;
}

interface DraftsState {
  /** What is written in each message box and not sent yet. */
  texts: Partial<Record<string, string>>;
  /** The message boxes whose Ultrathink switch is on. */
  ultrathink: Partial<Record<string, boolean>>;
  welcomeChoices: WelcomeChoices;
  setText: (draft: string, text: string) => void;
  setUltrathink: (draft: string, on: boolean) => void;
  chooseOnWelcome: (choices: WelcomeChoices) => void;
  /** Forgets the welcome state's choices, once its message has started a session. */
  forgetWelcomeChoices: () => void;
}

/**
 * What the person has written and chosen in a message box and not sent yet (ADR 0046): the welcome
 * state's text, menus and Ultrathink switch, and each session's text and switch. It outlives the
 * page that shows it, so leaving the welcome state or a session and coming back finds it as it
 * was, while Arden Code runs.
 */
export const useDraftsStore = create<DraftsState>()((set) => ({
  texts: {},
  ultrathink: {},
  welcomeChoices: {},
  setText: (draft, text) => {
    set((state) => ({ texts: { ...state.texts, [draft]: text } }));
  },
  setUltrathink: (draft, on) => {
    set((state) => ({ ultrathink: { ...state.ultrathink, [draft]: on } }));
  },
  chooseOnWelcome: (choices) => {
    set((state) => ({ welcomeChoices: { ...state.welcomeChoices, ...choices } }));
  },
  forgetWelcomeChoices: () => {
    set({ welcomeChoices: {} });
  },
}));
