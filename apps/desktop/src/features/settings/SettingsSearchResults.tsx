import { useTranslation } from "react-i18next";

import { settingDefinitions } from "./definitions";
import { matchesSearch } from "./search";
import { SettingItem } from "./SettingItem";

/** The settings, from every tab, whose name or description contains what was typed. */
export function SettingsSearchResults({ query }: { query: string }) {
  const { t } = useTranslation();
  const found = settingDefinitions.filter((definition) =>
    matchesSearch(
      { label: t(definition.labelKey), description: t(definition.descriptionKey) },
      query,
    ),
  );

  if (found.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t("settings.search.empty")}</p>;
  }
  return (
    <ul aria-label={t("settings.search.resultsLabel")}>
      {found.map((definition) => (
        <li key={definition.id} className="border-b border-border last:border-b-0">
          <p className="pt-3 text-xs text-muted-foreground">
            {t(`settings.tabs.${definition.tab}`)}
          </p>
          <SettingItem definition={definition} />
        </li>
      ))}
    </ul>
  );
}
