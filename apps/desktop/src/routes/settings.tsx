import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { SettingsSearchResults } from "@/features/settings/SettingsSearchResults";
import { SettingsTabs } from "@/features/settings/SettingsTabs";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

/**
 * The Settings page: the tabs on the left, and on the right a search box above the open tab. While
 * something is typed, the results from every tab take the place of the tab.
 */
function SettingsLayout() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";

  return (
    <div className="flex min-h-full">
      <SettingsTabs />
      <div className="min-w-0 flex-1">
        <div className="max-w-xl px-6 pt-6">
          <Input
            type="search"
            aria-label={t("settings.search.label")}
            placeholder={t("settings.search.placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
        {searching ? (
          <main className="max-w-xl p-6">
            <SettingsSearchResults query={query} />
          </main>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
