import { type QueryClient, type QueryKey, queryOptions } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import { defaultSettings } from "@/ipc/defaults.gen";

import { fallbackSystemPreferences } from "@/features/settings/systemPreferences";

import { commands, type SessionList, type UpdateStatus } from "./bindings";

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

/** The sessions as the sidebar lists them, before Rust has said, or where there is no Rust. */
export const noSessions: SessionList = { pinned: [], projects: [] };

/**
 * The projects and their sessions, in the order the sidebar lists them. Read again after anything
 * changes a session: one is made, gets its title, or has a message sent.
 */
export const sessionListQuery = queryOptions({
  queryKey: ["sessions"],
  queryFn: () => (isTauri() ? commands.listSessions() : noSessions),
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

/** Where the update is. Rust announces every change, so it is never fetched again on its own. */
export const updateStatusQuery = queryOptions({
  queryKey: ["update-status"],
  queryFn: (): Promise<UpdateStatus> =>
    isTauri() ? commands.getUpdateStatus() : Promise.resolve({ state: "idle" }),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Reads a query's data from Rust again, and keeps the answer only if nothing changed the data while
 * it was being read: a change made in the meantime, such as one the person just made, is newer.
 */
export async function readAgain<T>(
  client: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
): Promise<void> {
  const updates = client.getQueryState(queryKey)?.dataUpdateCount;
  const answer = await read();
  if (client.getQueryState(queryKey)?.dataUpdateCount === updates) {
    client.setQueryData(queryKey, answer);
  }
}
