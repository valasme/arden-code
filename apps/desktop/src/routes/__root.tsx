import { createRootRouteWithContext } from "@tanstack/react-router";

import type { RouterContext } from "@/app/router";
import { AppShell } from "@/components/layout/AppShell";
import { NotFound } from "@/components/NotFound";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFound,
});
