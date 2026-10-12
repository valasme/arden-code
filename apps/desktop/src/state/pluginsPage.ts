import { create } from "zustand";

interface PluginsPageState {
  /** What is typed in the plugins search, in the sidebar. Empty lists everything. */
  query: string;
  setQuery: (query: string) => void;
}

/** What the plugins sidebar and the Plugins page share (ADR 0053). */
export const usePluginsPageStore = create<PluginsPageState>()((set) => ({
  query: "",
  setQuery: (query) => {
    set({ query });
  },
}));

/** Whether a page belongs to the Plugins page. */
export function isPluginsPage(pathname: string): boolean {
  return /^\/plugins(?:\/|$)/u.test(pathname);
}
