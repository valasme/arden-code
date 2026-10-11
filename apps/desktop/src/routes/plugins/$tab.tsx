import { createFileRoute, notFound } from "@tanstack/react-router";

import { DiscoverTab } from "@/features/plugins/DiscoverTab";
import { InstalledTab } from "@/features/plugins/InstalledTab";
import { isPluginsTab } from "@/features/plugins/tabs";

export const Route = createFileRoute("/plugins/$tab")({
  beforeLoad: ({ params }) => {
    if (!isPluginsTab(params.tab)) throw notFound();
  },
  component: PluginsTabPage,
});

/** A tab of the Plugins page. */
function PluginsTabPage() {
  const { tab } = Route.useParams();
  // beforeLoad has already turned away tabs that do not exist.
  if (!isPluginsTab(tab)) return null;
  return tab === "discover" ? <DiscoverTab /> : <InstalledTab />;
}
