import { useQueryClient } from "@tanstack/react-query";

import { events } from "@/ipc/bindings";
import { updateStatusQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

/** Keeps the status bar in step with the update: Rust announces every change. Draws nothing. */
export function UpdateSync() {
  const queryClient = useQueryClient();

  useTauriListener(() =>
    events.updateStatusChanged.listen(({ payload }) => {
      queryClient.setQueryData(updateStatusQuery.queryKey, payload.status);
    }),
  );

  return null;
}
