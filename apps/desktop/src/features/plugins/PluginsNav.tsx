import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { sidebarRow } from "@/components/layout/sidebarRow";
import { Input } from "@/components/ui/input";
import { usePluginsPageStore } from "@/state/pluginsPage";
import { useSettingsPageStore } from "@/state/settingsPage";

import { pluginsTabs } from "./tabs";

/**
 * What the sidebar shows on the Plugins page, in place of the projects, as on a settings page
 * (ADR 0053): Back to the last page outside it, the plugins search, and the tabs.
 */
export function PluginsNav() {
  const { t } = useTranslation();
  const query = usePluginsPageStore((state) => state.query);
  const setQuery = usePluginsPageStore((state) => state.setQuery);
  const returnTo = useSettingsPageStore((state) => state.returnTo);

  // A search belongs to one visit to the page.
  useEffect(
    () => () => {
      setQuery("");
    },
    [setQuery],
  );

  return (
    <>
      <Link to={returnTo} className={sidebarRow}>
        <ArrowLeftIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
        {t("plugins.back")}
      </Link>
      <Input
        type="search"
        className="my-2 h-7 bg-background dark:bg-background"
        aria-label={t("plugins.search.label")}
        placeholder={t("plugins.search.placeholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <nav aria-label={t("plugins.tabsLabel")}>
        <ul className="flex flex-col gap-px">
          {pluginsTabs.map((tab) => (
            <li key={tab}>
              <Link to="/plugins/$tab" params={{ tab }} className={sidebarRow}>
                {t(`plugins.tabs.${tab}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
