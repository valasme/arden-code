import { create } from "zustand";

interface SettingsPageState {
  /** What is typed in the settings search, in the sidebar. Empty shows the open tab. */
  query: string;
  /** Where Back in the settings sidebar returns to: the last page outside Settings. */
  returnTo: string;
  setQuery: (query: string) => void;
  setReturnTo: (href: string) => void;
}

/** What the settings sidebar and the settings page share (ADR 0032). */
export const useSettingsPageStore = create<SettingsPageState>()((set) => ({
  query: "",
  returnTo: "/",
  setQuery: (query) => {
    set({ query });
  },
  setReturnTo: (returnTo) => {
    set({ returnTo });
  },
}));

/** Whether a page belongs to Settings: its tabs, and the log viewer it opens. */
export function isSettingsPage(pathname: string): boolean {
  return /^\/(?:settings|logs)(?:\/|$)/u.test(pathname);
}
