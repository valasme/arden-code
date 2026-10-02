import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { sidebarRow } from "@/components/layout/sidebarRow";
import { Input } from "@/components/ui/input";
import { useSettingsPageStore } from "@/state/settingsPage";

import { settingsTabs } from "./tabs";

/**
 * What the sidebar shows on a settings page, in place of the projects (ADR 0032): Back to the last
 * page outside Settings, the settings search, and the tabs.
 */
export function SettingsNav() {
  const { t } = useTranslation();
  const query = useSettingsPageStore((state) => state.query);
  const setQuery = useSettingsPageStore((state) => state.setQuery);
  const returnTo = useSettingsPageStore((state) => state.returnTo);

  // A search belongs to one visit to Settings.
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
        {t("settings.back")}
      </Link>
      <Input
        type="search"
        className="my-2 h-7 bg-background dark:bg-background"
        aria-label={t("settings.search.label")}
        placeholder={t("settings.search.placeholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <nav aria-label={t("settings.tabsLabel")}>
        <ul className="flex flex-col gap-px">
          {settingsTabs.map((tab) => (
            <li key={tab}>
              <Link to="/settings/$tab" params={{ tab }} className={sidebarRow}>
                {t(`settings.tabs.${tab}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
