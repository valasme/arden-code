import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { settingsTabs } from "./tabs";

/** The list of settings tabs, beside the open one. */
export function SettingsTabs() {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("settings.tabsLabel")} className="w-44 shrink-0 border-r border-border p-2">
      <ul className="flex flex-col gap-0.5">
        {settingsTabs.map((tab) => (
          <li key={tab}>
            <Link
              to="/settings/$tab"
              params={{ tab }}
              className="flex h-7 items-center px-2 text-sm hover:bg-muted [&.active]:bg-muted [&.active]:font-medium forced-colors:[&.active]:underline"
            >
              {t(`settings.tabs.${tab}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
