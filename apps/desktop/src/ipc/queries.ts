import { queryOptions } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import { defaultSettings } from "@/ipc/defaults.gen";

import { fallbackSystemPreferences } from "@/features/settings/systemPreferences";

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

/** The Windows text size and regional format. Rust announces every change, like the settings. */
export const systemPreferencesQuery = queryOptions({
  queryKey: ["system-preferences"],
  queryFn: () => (isTauri() ? commands.getSystemPreferences() : fallbackSystemPreferences()),
  staleTime: Number.POSITIVE_INFINITY,
});

/** The Windows and WebView2 versions. They do not change while the app runs. */
export const systemInfoQuery = queryOptions({
  queryKey: ["system-info"],
  queryFn: () => commands.getSystemInfo(),
  staleTime: Number.POSITIVE_INFINITY,
});
