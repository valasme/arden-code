import { useTranslation } from "react-i18next";

import { settingDefinitions } from "./definitions";
import { SettingItem } from "./SettingItem";
import type { SettingsTab } from "./tabs";

/** A sample of code, so that the code settings can be judged by looking at it. */
function CodePreview() {
  const { t } = useTranslation();
  return (
    <figure className="mb-4 bg-muted p-4">
      <figcaption className="mb-2 text-xs text-muted-foreground">
        {t("settings.appearance.codePreview")}
      </figcaption>
      <pre className="whitespace-pre-wrap">
        <code>{"const total = items.filter((item) => item.id !== 0 && item.ok).length;"}</code>
      </pre>
    </figure>
  );
}

/** Every setting on one tab, as the rows of one bordered list (ADR 0032). */
export function SettingsList({ tab }: { tab: SettingsTab }) {
  const { t } = useTranslation();
  return (
    <>
      {tab === "appearance" ? <CodePreview /> : null}
      <ul aria-label={t(`settings.tabs.${tab}`)} className="border border-border">
        {settingDefinitions
          .filter((definition) => definition.tab === tab)
          .map((definition) => (
            <li key={definition.id} className="border-b border-border last:border-b-0">
              <SettingItem definition={definition} />
            </li>
          ))}
      </ul>
    </>
  );
}
