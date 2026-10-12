import { createFileRoute, redirect } from "@tanstack/react-router";

import { firstPluginsTab } from "@/features/plugins/tabs";

/** /plugins opens the first tab. */
export const Route = createFileRoute("/plugins/")({
  beforeLoad: () => {
    throw redirect({ to: "/plugins/$tab", params: { tab: firstPluginsTab } });
  },
});
