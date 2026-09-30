import { queryOptions } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import { defaultSettings } from "@/ipc/defaults.gen";

import { commands } from "./bindings";

/** The product name and version. They never change while the app runs. */
export const appInfoQuery = queryOptions({
  queryKey: ["app-info"],
  queryFn: () => commands.appInfo(),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * The settings. Rust announces every change, so they are never fetched again: the events keep this
 * cache current.
 */
export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => (isTauri() ? commands.getSettings() : defaultSettings),
  staleTime: Number.POSITIVE_INFINITY,
});
