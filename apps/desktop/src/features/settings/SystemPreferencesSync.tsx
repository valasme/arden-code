import { useQueryClient } from "@tanstack/react-query";

import { events } from "@/ipc/bindings";
import { systemPreferencesQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

/**
 * Keeps the Windows text size and regional format on screen in step with Windows: Rust notices a
 * change and sends it as an event. Draws nothing.
 */
export function SystemPreferencesSync() {
  const queryClient = useQueryClient();

  useTauriListener(() =>
    events.systemPreferencesChanged.listen(({ payload }) => {
      queryClient.setQueryData(systemPreferencesQuery.queryKey, payload.preferences);
    }),
  );

  return null;
}
