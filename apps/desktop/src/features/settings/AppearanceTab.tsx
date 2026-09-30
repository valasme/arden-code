import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Theme } from "@/ipc/bindings";

import { SettingRow } from "./SettingRow";
import { useChangeSetting, useSettings } from "./useSettings";

const themes = ["system", "light", "dark"] as const satisfies readonly Theme[];

function isTheme(value: string): value is Theme {
  return (themes as readonly string[]).includes(value);
}

/** Appearance: the theme, for now. */
export function AppearanceTab() {
  const { t } = useTranslation();
  const settings = useSettings();
  const change = useChangeSetting();

  return (
    <SettingRow
      id="theme"
      label={t("settings.appearance.theme.label")}
      description={t("settings.appearance.theme.description")}
    >
      <RadioGroup
        aria-labelledby="theme-label"
        aria-describedby="theme-description"
        value={settings.appearance.theme}
        onValueChange={(value) => {
          if (isTheme(value)) change.mutate({ appearanceTheme: value });
        }}
      >
        {themes.map((theme) => (
          <div key={theme} className="flex items-center gap-2">
            <RadioGroupItem value={theme} id={`theme-${theme}`} />
            <Label htmlFor={`theme-${theme}`} className="text-sm font-normal">
              {t(`settings.appearance.theme.${theme}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </SettingRow>
  );
}
