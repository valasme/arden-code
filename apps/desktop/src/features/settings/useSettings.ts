import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { commands, type SettingChange, type Settings } from "@/ipc/bindings";
import { settingsQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { showErrorToast } from "@/lib/errorToasts";

import { defaultSettings } from "./defaults";

/** The settings now. Until Rust has answered, the defaults. */
export function useSettings(): Settings {
  return useQuery(settingsQuery).data ?? defaultSettings;
}

/** What the settings look like once a change is applied. Rust applies the same change when saving. */
function applyChange(settings: Settings, change: SettingChange): Settings {
  return { ...settings, appearance: { ...settings.appearance, theme: change.appearanceTheme } };
}

/**
 * Changes a setting. The screen shows the new value at once; if saving fails, the old value comes
 * back and the person is told, with the error code.
 */
export function useChangeSetting() {
  const queryClient = useQueryClient();
  const key = settingsQuery.queryKey;

  return useMutation({
    mutationFn: (change: SettingChange) => commands.changeSetting(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Settings>(key) ?? defaultSettings;
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
}
