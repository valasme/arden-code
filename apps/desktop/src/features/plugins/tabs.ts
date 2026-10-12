/** The tabs of the Plugins page, in the order they are listed (plan section 6.13). */
export const pluginsTabs = ["discover", "installed", "marketplaces"] as const;

export type PluginsTab = (typeof pluginsTabs)[number];

export function isPluginsTab(value: string): value is PluginsTab {
  return (pluginsTabs as readonly string[]).includes(value);
}

/** The tab the page opens at. */
export const firstPluginsTab: PluginsTab = "discover";
