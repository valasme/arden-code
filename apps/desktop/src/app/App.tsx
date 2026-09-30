import "@/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { SettingsSync } from "@/features/settings/SettingsSync";
import { ThemeFromSettings } from "@/features/settings/ThemeFromSettings";
import type { Settings } from "@/ipc/bindings";
import { settingsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { installGlobalErrorHandlers } from "@/lib/globalErrors";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { createAppRouter } from "./router";

interface AppProps {
  /** Tests pass an in-memory history; the real app uses the browser's. */
  history?: RouterHistory;
  /** The settings, when they were already read before the first render. */
  initialSettings?: Settings;
}

export function App({ history, initialSettings }: AppProps) {
  const [queryClient] = useState(() => {
    const client = new QueryClient();
    if (initialSettings) client.setQueryData(settingsQuery.queryKey, initialSettings);
    return client;
  });
  const [router] = useState(() => createAppRouter(queryClient, history));

  // Errors and rejected promises that nothing else catches are logged and shown as a notice.
  useEffect(() => installGlobalErrorHandlers(showErrorToast), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsSync />
      <ThemeFromSettings />
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}
