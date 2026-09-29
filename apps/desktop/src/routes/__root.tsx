import { createRootRouteWithContext } from "@tanstack/react-router";

import type { RouterContext } from "@/app/router";
import { RootLayout } from "@/components/RootLayout";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
