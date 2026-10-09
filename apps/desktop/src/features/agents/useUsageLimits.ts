import { useQuery, useQueryClient } from "@tanstack/react-query";

import { events, type UsageLimits } from "@/ipc/bindings";
import { usageLimitsQuery } from "@/ipc/queries";
import { useTauriListener } from "@/lib/useTauriListener";

const unknown: UsageLimits = { report: "unknown", windows: [] };

/** The person's usage limits, as Claude Code last reported them, kept current as it reports more (ADR 0043). */
export function useUsageLimits(): UsageLimits {
  const queryClient = useQueryClient();
  const { data } = useQuery(usageLimitsQuery);

  useTauriListener(() =>
    events.usageLimitsChanged.listen(({ payload }) => {
      queryClient.setQueryData(usageLimitsQuery.queryKey, payload.limits);
    }),
  );

  return data ?? unknown;
}
