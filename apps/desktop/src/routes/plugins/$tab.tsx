import { createFileRoute, notFound } from "@tanstack/react-router";

import { DiscoverTab } from "@/features/plugins/DiscoverTab";
import { InstalledTab } from "@/features/plugins/InstalledTab";
import { MarketplacesTab } from "@/features/plugins/MarketplacesTab";
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
  switch (tab) {
    case "discover": {
      return <DiscoverTab />;
    }
    case "installed": {
      return <InstalledTab />;
    }
    case "marketplaces": {
      return <MarketplacesTab />;
    }
  }
  return null;
}
