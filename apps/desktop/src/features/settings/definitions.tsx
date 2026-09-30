import type { ParseKeys } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { OnStartup, ReduceMotion, SettingKey, Settings, Theme } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";

import { ChoiceControl, RangeControl, ToggleControl } from "./controls";
import type { SettingsTab } from "./tabs";
import type { useChangeSetting } from "./useSettings";
import { zoomRange } from "./zoom";

/** What a setting's control is given. */
interface ControlProps {
  /** The setting's id, which names its label and description on the page. */
  id: string;
  settings: Settings;
  change: ReturnType<typeof useChangeSetting>;
}

/**
 * One setting, described once: where it lives, how it is named, how to tell whether it still has
 * its default, and its control. The tabs, the search and the reset button all read this.
 */
export interface SettingDefinition {
  id: string;
  tab: SettingsTab;
  key: SettingKey;
  labelKey: ParseKeys;
  descriptionKey: ParseKeys;
  /** Whether the setting has its default value. */
  isDefault: (settings: Settings) => boolean;
  Control: (props: ControlProps) => ReactNode;
}

const same = defaultSettings;

const startupChoices = ["restore", "fresh"] as const satisfies readonly OnStartup[];
const themeChoices = ["system", "light", "dark"] as const satisfies readonly Theme[];
const motionChoices = ["system", "on", "off"] as const satisfies readonly ReduceMotion[];

export const settingDefinitions: readonly SettingDefinition[] = [
  {
    id: "startup",
    tab: "general",
    key: "generalOnStartup",
    labelKey: "settings.general.onStartup.label",
    descriptionKey: "settings.general.onStartup.description",
    isDefault: (settings) => settings.general.onStartup === same.general.onStartup,
    Control: function StartupControl({ id, settings, change }) {
      const { t } = useTranslation();
      return (
        <ChoiceControl
          id={id}
          value={settings.general.onStartup}
          options={startupChoices.map((value) => ({
            value,
            label: t(`settings.general.onStartup.${value}`),
          }))}
          onChange={(value) => {
            change.mutate({ generalOnStartup: value });
          }}
        />
      );
    },
  },
  {
    id: "check-for-updates",
    tab: "general",
    key: "generalCheckForUpdates",
    labelKey: "settings.general.checkForUpdates.label",
    descriptionKey: "settings.general.checkForUpdates.description",
    isDefault: (settings) => settings.general.checkForUpdates === same.general.checkForUpdates,
    Control: ({ id, settings, change }) => (
      <ToggleControl
        id={id}
        checked={settings.general.checkForUpdates}
        onChange={(checked) => {
          change.mutate({ generalCheckForUpdates: checked });
        }}
      />
    ),
  },
  {
    id: "theme",
    tab: "appearance",
    key: "appearanceTheme",
    labelKey: "settings.appearance.theme.label",
    descriptionKey: "settings.appearance.theme.description",
    isDefault: (settings) => settings.appearance.theme === same.appearance.theme,
    Control: function ThemeControl({ id, settings, change }) {
      const { t } = useTranslation();
      return (
        <ChoiceControl
          id={id}
          value={settings.appearance.theme}
          options={themeChoices.map((value) => ({
            value,
            label: t(`settings.appearance.theme.${value}`),
          }))}
          onChange={(value) => {
            change.mutate({ appearanceTheme: value });
          }}
        />
      );
    },
  },
  {
    id: "zoom",
    tab: "appearance",
    key: "appearanceZoom",
    labelKey: "settings.appearance.zoom.label",
    descriptionKey: "settings.appearance.zoom.description",
    isDefault: (settings) => settings.appearance.zoom === same.appearance.zoom,
    Control: function ZoomControl({ id, settings, change }) {
      const { t } = useTranslation();
      return (
        <RangeControl
          id={id}
          value={settings.appearance.zoom}
          min={zoomRange.min}
          max={zoomRange.max}
          step={5}
          format={(value) => t("settings.appearance.zoom.value", { value })}
          onPreview={(value) => {
            change.preview({ appearanceZoom: value });
          }}
          onCommit={(value) => {
            change.mutate({ appearanceZoom: value });
          }}
        />
      );
    },
  },
  {
    id: "code-font-size",
    tab: "appearance",
    key: "appearanceCodeFontSize",
    labelKey: "settings.appearance.codeFontSize.label",
    descriptionKey: "settings.appearance.codeFontSize.description",
    isDefault: (settings) => settings.appearance.codeFontSize === same.appearance.codeFontSize,
    Control: function CodeFontSizeControl({ id, settings, change }) {
      const { t } = useTranslation();
      return (
        <RangeControl
          id={id}
          value={settings.appearance.codeFontSize}
          min={11}
          max={20}
          step={1}
          format={(value) => t("settings.appearance.codeFontSize.value", { value })}
          onPreview={(value) => {
            change.preview({ appearanceCodeFontSize: value });
          }}
          onCommit={(value) => {
            change.mutate({ appearanceCodeFontSize: value });
          }}
        />
      );
    },
  },
  {
    id: "code-ligatures",
    tab: "appearance",
    key: "appearanceCodeLigatures",
    labelKey: "settings.appearance.codeLigatures.label",
    descriptionKey: "settings.appearance.codeLigatures.description",
    isDefault: (settings) => settings.appearance.codeLigatures === same.appearance.codeLigatures,
    Control: ({ id, settings, change }) => (
      <ToggleControl
        id={id}
        checked={settings.appearance.codeLigatures}
        onChange={(checked) => {
          change.mutate({ appearanceCodeLigatures: checked });
        }}
      />
    ),
  },
  {
    id: "reduce-motion",
    tab: "appearance",
    key: "appearanceReduceMotion",
    labelKey: "settings.appearance.reduceMotion.label",
    descriptionKey: "settings.appearance.reduceMotion.description",
    isDefault: (settings) => settings.appearance.reduceMotion === same.appearance.reduceMotion,
    Control: function ReduceMotionControl({ id, settings, change }) {
      const { t } = useTranslation();
      return (
        <ChoiceControl
          id={id}
          value={settings.appearance.reduceMotion}
          options={motionChoices.map((value) => ({
            value,
            label: t(`settings.appearance.reduceMotion.${value}`),
          }))}
          onChange={(value) => {
            change.mutate({ appearanceReduceMotion: value });
          }}
        />
      );
    },
  },
  {
    id: "show-status-bar",
    tab: "appearance",
    key: "appearanceShowStatusBar",
    labelKey: "settings.appearance.showStatusBar.label",
    descriptionKey: "settings.appearance.showStatusBar.description",
    isDefault: (settings) => settings.appearance.showStatusBar === same.appearance.showStatusBar,
    Control: ({ id, settings, change }) => (
      <ToggleControl
        id={id}
        checked={settings.appearance.showStatusBar}
        onChange={(checked) => {
          change.mutate({ appearanceShowStatusBar: checked });
        }}
      />
    ),
  },
];
