import "@/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { showErrorToast } from "@/lib/errorToasts";
import { installGlobalErrorHandlers } from "@/lib/globalErrors";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { createAppRouter } from "./router";

interface AppProps {
  /** Tests pass an in-memory history; the real app uses the browser's. */
  history?: RouterHistory;
}

export function App({ history }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() => createAppRouter(queryClient, history));

  // Errors and rejected promises that nothing else catches are logged and shown as a notice.
  useEffect(() => installGlobalErrorHandlers(showErrorToast), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}
