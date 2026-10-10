import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { commands, type SettingChange, type SettingKey, type Settings } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";
import { settingsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/** The settings now. Until Rust has answered, the defaults. */
export function useSettings(): Settings {
  return useQuery(settingsQuery).data ?? defaultSettings;
}

/** What the settings look like once a change is applied. Rust applies the same change when saving. */
function applyChange(settings: Settings, change: SettingChange): Settings {
  const { general, appearance, layout, advanced } = settings;
  if (change.generalOnStartup !== undefined) {
    return { ...settings, general: { ...general, onStartup: change.generalOnStartup } };
  }
  if (change.generalCheckForUpdates !== undefined) {
    return { ...settings, general: { ...general, checkForUpdates: change.generalCheckForUpdates } };
  }
  if (change.generalRegionalFormat !== undefined) {
    return {
      ...settings,
      general: { ...general, regionalFormat: change.generalRegionalFormat },
    };
  }
  if (change.appearanceFollowTextSize !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, followTextSize: change.appearanceFollowTextSize },
    };
  }
  if (change.appearanceTheme !== undefined) {
    return { ...settings, appearance: { ...appearance, theme: change.appearanceTheme } };
  }
  if (change.appearanceZoom !== undefined) {
    return { ...settings, appearance: { ...appearance, zoom: change.appearanceZoom } };
  }
  if (change.appearanceCodeFontSize !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, codeFontSize: change.appearanceCodeFontSize },
    };
  }
  if (change.appearanceCodeLigatures !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, codeLigatures: change.appearanceCodeLigatures },
    };
  }
  if (change.appearanceReduceMotion !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, reduceMotion: change.appearanceReduceMotion },
    };
  }
  if (change.appearanceSmoothScrolling !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, smoothScrolling: change.appearanceSmoothScrolling },
    };
  }
  if (change.appearanceShowStatusBar !== undefined) {
    return {
      ...settings,
      appearance: { ...appearance, showStatusBar: change.appearanceShowStatusBar },
    };
  }
  if (change.layoutSidebarWidth !== undefined) {
    return { ...settings, layout: { ...layout, sidebarWidth: change.layoutSidebarWidth } };
  }
  if (change.layoutInspectorWidth !== undefined) {
    return { ...settings, layout: { ...layout, inspectorWidth: change.layoutInspectorWidth } };
  }
  if (change.notificationsDesktop !== undefined) {
    return {
      ...settings,
      notifications: { ...settings.notifications, desktop: change.notificationsDesktop },
    };
  }
  if (change.agentsShowUsageLimits !== undefined) {
    return {
      ...settings,
      agents: { ...settings.agents, showUsageLimits: change.agentsShowUsageLimits },
    };
  }
  if (change.agentsAllowBypassPermissions !== undefined) {
    return {
      ...settings,
      agents: { ...settings.agents, allowBypassPermissions: change.agentsAllowBypassPermissions },
    };
  }
  if (change.advancedLogLevel !== undefined) {
    return { ...settings, advanced: { ...advanced, logLevel: change.advancedLogLevel } };
  }
  if (change.advancedDeveloperMode !== undefined) {
    return { ...settings, advanced: { ...advanced, developerMode: change.advancedDeveloperMode } };
  }
  if (change.advancedNativeTitleBar !== undefined) {
    return {
      ...settings,
      advanced: { ...advanced, nativeTitleBar: change.advancedNativeTitleBar },
    };
  }
  return {
    ...settings,
    advanced: { ...advanced, hardwareAcceleration: change.advancedHardwareAcceleration },
  };
}

/**
 * Changes a setting. The screen shows the new value at once; if saving fails, the old value comes
 * back and the person is told, with the error code.
 *
 * `preview` shows a value without saving it, for a slider that is still being dragged. The next
 * `mutate` saves the final value, and a failure goes back to what the screen showed before the drag.
 */
export function useChangeSetting() {
  const queryClient = useQueryClient();
  const key = settingsQuery.queryKey;
  const beforePreview = useRef<Settings | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (change: SettingChange) => commands.changeSetting(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        beforePreview.current ?? queryClient.getQueryData<Settings>(key) ?? defaultSettings;
      beforePreview.current = undefined;
      queryClient.setQueryData(key, applyChange(previous, change));
      return { previous };
    },
    onError: (error, _change, context) => {
      queryClient.setQueryData(key, context?.previous ?? defaultSettings);
      showErrorToast(toAppError(error));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
  });

  return {
    mutate: mutation.mutate,
    preview: (change: SettingChange) => {
      const current = queryClient.getQueryData<Settings>(key) ?? defaultSettings;
      beforePreview.current ??= current;
      queryClient.setQueryData(key, applyChange(current, change));
    },
  };
}

/** Puts one setting back to its default. Rust knows the defaults; the screen follows its answer. */
export function useResetSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: SettingKey) => commands.resetSetting(key),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQuery.queryKey, saved);
    },
    onError: (error) => {
      showErrorToast(toAppError(error));
    },
  });
}
