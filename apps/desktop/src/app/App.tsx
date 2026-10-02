import "@/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Toaster } from "@/components/Toaster";
import { CrashRecovery } from "@/features/diagnostics/CrashRecovery";
import { WebEngineNotice } from "@/features/diagnostics/WebEngineNotice";
import { SettingsSync } from "@/features/settings/SettingsSync";
import { StartupSettingsProvider } from "@/features/settings/startup";
import { AppearanceFromSettings } from "@/features/settings/AppearanceFromSettings";
import { ResetNotice } from "@/features/settings/ResetNotice";
import { SystemPreferencesSync } from "@/features/settings/SystemPreferencesSync";
import { UpdateSync } from "@/features/updates/UpdateSync";
import type { Settings, SystemPreferences } from "@/ipc/bindings";
import { settingsQuery, systemPreferencesQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { installGlobalErrorHandlers } from "@/lib/globalErrors";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { createAppRouter } from "./router";

interface AppProps {
  /** Tests pass an in-memory history; the real app uses the browser's. */
  history?: RouterHistory;
  /** The settings, when they were already read before the first render. */
  initialSettings?: Settings;
  /** The Windows text size and regional format, when they were already read before the first render. */
  initialSystemPreferences?: SystemPreferences;
}

export function App({ history, initialSettings, initialSystemPreferences }: AppProps) {
  const [queryClient] = useState(() => {
    const client = new QueryClient();
    if (initialSettings) client.setQueryData(settingsQuery.queryKey, initialSettings);
    if (initialSystemPreferences) {
      client.setQueryData(systemPreferencesQuery.queryKey, initialSystemPreferences);
    }
    return client;
  });
  const [router] = useState(() => createAppRouter(queryClient, history));

  // Errors and rejected promises that nothing else catches are logged and shown as a notice.
  useEffect(() => installGlobalErrorHandlers(showErrorToast), []);

  return (
    <QueryClientProvider client={queryClient}>
      <StartupSettingsProvider settings={initialSettings}>
        <SettingsSync />
        <SystemPreferencesSync />
        <UpdateSync />
        <WebEngineNotice />
        <ResetNotice />
        <AppearanceFromSettings />
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
        <Toaster />
        <CrashRecovery />
      </StartupSettingsProvider>
    </QueryClientProvider>
  );
}
