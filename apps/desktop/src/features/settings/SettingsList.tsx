import { useTranslation } from "react-i18next";

import { settingDefinitions } from "./definitions";
import { SettingItem } from "./SettingItem";
import type { SettingsTab } from "./tabs";

/** A sample of code, so that the code settings can be judged by looking at it. */
function CodePreview() {
  const { t } = useTranslation();
  return (
    <figure className="my-4 border border-border p-3">
      <figcaption className="mb-2 text-xs text-muted-foreground">
        {t("settings.appearance.codePreview")}
      </figcaption>
      <pre className="whitespace-pre-wrap">
        <code>{"const total = items.filter((item) => item.id !== 0 && item.ok).length;"}</code>
      </pre>
    </figure>
  );
}

/** Every setting on one tab. */
export function SettingsList({ tab }: { tab: SettingsTab }) {
  return (
    <div>
      {tab === "appearance" ? <CodePreview /> : null}
      {settingDefinitions
        .filter((definition) => definition.tab === tab)
        .map((definition) => (
          <SettingItem key={definition.id} definition={definition} />
        ))}
    </div>
  );
}
