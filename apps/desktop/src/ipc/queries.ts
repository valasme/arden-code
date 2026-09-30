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

/** The newest log entries. They are read again when asked for. */
export const logsQuery = queryOptions({
  queryKey: ["logs"],
  queryFn: () => (isTauri() ? commands.readLogs() : []),
  staleTime: 0,
  gcTime: 0,
});

/** The crash reports the person has not been told about. */
export const pendingCrashesQuery = queryOptions({
  queryKey: ["pending-crashes"],
  queryFn: () => (isTauri() ? commands.pendingCrashes() : []),
  staleTime: Number.POSITIVE_INFINITY,
});

/** The projects and their sessions. Refetched after a session is made or gets its title. */
export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: () => (isTauri() ? commands.listProjects() : []),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * One session with its turns. While a reply streams the cache is updated from the channel, so it
 * is never fetched again on its own.
 */
export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ["session", id],
    queryFn: () => commands.getSession(id),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

/** Which agent programs are installed. Looked for again when asked, since the person may install one. */
export const agentsQuery = queryOptions({
  queryKey: ["agents"],
  queryFn: () => (isTauri() ? commands.detectAgents() : []),
  staleTime: 0,
  gcTime: 0,
});
