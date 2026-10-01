import { useTranslation } from "react-i18next";

import type { SettingDefinition } from "./definitions";
import { SettingRow } from "./SettingRow";
import { useChangeSetting, useResetSetting, useSettings } from "./useSettings";

/** One setting, drawn from its definition. */
export function SettingItem({ definition }: { definition: SettingDefinition }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const change = useChangeSetting();
  const reset = useResetSetting();
  const { Control } = definition;

  return (
    <SettingRow
      id={definition.id}
      label={t(definition.labelKey)}
      description={t(definition.descriptionKey)}
      modified={!definition.isDefault(settings)}
      onReset={() => reset.mutateAsync(definition.key).catch(() => {})}
    >
      <Control id={definition.id} settings={settings} change={change} />
    </SettingRow>
  );
}
