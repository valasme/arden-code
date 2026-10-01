import { useQueryClient } from "@tanstack/react-query";

import { commands, events } from "@/ipc/bindings";
import { readAgain, systemPreferencesQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

/**
 * Keeps the Windows text size and regional format on screen in step with Windows: Rust notices a
 * change and sends it as an event, and they are read again once listening starts. Draws nothing.
 */
export function SystemPreferencesSync() {
  const queryClient = useQueryClient();

  useTauriListener(async () => {
    const stopListening = await events.systemPreferencesChanged.listen(({ payload }) => {
      queryClient.setQueryData(systemPreferencesQuery.queryKey, payload.preferences);
    });
    // As with the settings: a change made before this listened sent no event it heard.
    readAgain(queryClient, systemPreferencesQuery.queryKey, commands.getSystemPreferences).catch(
      () => {},
    );
    return stopListening;
  });

  return null;
}
