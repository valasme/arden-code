import "@/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useState } from "react";

import { createAppRouter } from "./router";

interface AppProps {
  /** Tests pass an in-memory history; the real app uses the browser's. */
  history?: RouterHistory;
}

export function App({ history }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() => createAppRouter(queryClient, history));

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
