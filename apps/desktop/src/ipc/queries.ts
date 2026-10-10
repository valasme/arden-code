import { type QueryClient, type QueryKey, queryOptions } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import { defaultSettings } from "@/ipc/defaults.gen";

import { fallbackSystemPreferences } from "@/features/settings/systemPreferences";

import {
  type Catalog,
  type Effort,
  type PermissionMode,
  type Model,
  type AgentKind,
  commands,
  type SessionList,
  type UpdateStatus,
  type UsageLimits,
} from "./bindings";

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
export const noSessions: SessionList = { pinned: [], projects: [], archived: [] };

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
 * The agent a new session in the Playground takes (ADR 0039). It shares the key of the list of
 * sessions, so it is read again whenever the list is.
 */
export const newSessionAgentQuery = queryOptions({
  queryKey: ["sessions", "new-session-agent"],
  queryFn: (): Promise<AgentKind> =>
    isTauri() ? commands.agentForNewSession(null) : Promise.resolve("demo"),
  staleTime: Number.POSITIVE_INFINITY,
});

/** The model a new session in a project takes (ADR 0041), null for the agent's own setting. */
export const modelForProjectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...newSessionAgentQuery.queryKey, projectId, "model"],
    queryFn: (): Promise<Model | null> =>
      isTauri() ? commands.modelForNewSession(projectId) : Promise.resolve(null),
    staleTime: Number.POSITIVE_INFINITY,
  });

/** The effort a new session in a project takes (ADR 0041), null for the agent's own setting. */
export const effortForProjectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...newSessionAgentQuery.queryKey, projectId, "effort"],
    queryFn: (): Promise<Effort | null> =>
      isTauri() ? commands.effortForNewSession(projectId) : Promise.resolve(null),
    staleTime: Number.POSITIVE_INFINITY,
  });

/** The permission mode a new session in a project takes (ADR 0044): never Bypass permissions. */
export const permissionModeForProjectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...newSessionAgentQuery.queryKey, projectId, "permissionMode"],
    queryFn: (): Promise<PermissionMode> =>
      isTauri()
        ? commands.permissionModeForNewSession(projectId)
        : Promise.resolve<PermissionMode>("manual"),
    staleTime: Number.POSITIVE_INFINITY,
  });

/** How often Rust is asked for Claude Code's commands and models while it has none (ADR 0042). */
const CATALOG_RETRY_MS = 1500;
/** How many times it is asked again: Claude Code may not be installed. */
const CATALOG_RETRIES = 20;

/**
 * What Claude Code says it can do: its slash commands and models (ADR 0042). Rust has them once a
 * Claude Code has been heard, so until then the page asks again, a few times.
 */
export const claudeCatalogQuery = queryOptions({
  queryKey: ["claude-catalog"],
  queryFn: (): Promise<Catalog> =>
    isTauri()
      ? commands.claudeCatalog()
      : Promise.resolve({ commands: [], models: [], terminalCommands: [] }),
  staleTime: Number.POSITIVE_INFINITY,
  refetchInterval: (query) => {
    const known = (query.state.data?.commands.length ?? 0) + (query.state.data?.models.length ?? 0);
    return known > 0 || query.state.dataUpdateCount > CATALOG_RETRIES ? false : CATALOG_RETRY_MS;
  },
});

/** The agent a new session in a project takes (ADR 0039), for the welcome screen's choice. */
export const agentForProjectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...newSessionAgentQuery.queryKey, projectId],
    queryFn: (): Promise<AgentKind> =>
      isTauri() ? commands.agentForNewSession(projectId) : Promise.resolve("demo"),
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
  // What Rust found after it started; Settings → Agents asks for a fresh look itself.
  queryFn: () => (isTauri() ? commands.detectAgents(false) : []),
  staleTime: 0,
  gcTime: 0,
});

/**
 * The person's usage limits, as Claude Code last reported them (ADR 0043). Rust announces each
 * change, so they are never fetched again on their own.
 */
export const usageLimitsQuery = queryOptions({
  queryKey: ["usage-limits"],
  queryFn: (): Promise<UsageLimits> =>
    isTauri() ? commands.usageLimits() : Promise.resolve({ report: "unknown", windows: [] }),
  staleTime: Number.POSITIVE_INFINITY,
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
