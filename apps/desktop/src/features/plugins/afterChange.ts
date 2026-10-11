import type { QueryClient } from "@tanstack/react-query";

import { claudeCatalogQuery } from "@/ipc/queries";

/**
 * Reads again what a change to plugins changed (ADR 0053): what is installed, what the
 * marketplaces offer, and the slash commands, so that a new plugin's skills can be run at once.
 */
export async function afterChange(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["plugins"], refetchType: "all" }),
    queryClient.fetchQuery({ ...claudeCatalogQuery, staleTime: 0 }),
  ]);
}
