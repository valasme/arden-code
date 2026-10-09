import { useQuery } from "@tanstack/react-query";

import type { UsageLimits } from "@/ipc/bindings";
import { usageLimitsQuery } from "@/ipc/queries";

const unknown: UsageLimits = { report: "unknown", windows: [] };

/**
 * The person's usage limits, as Claude Code last reported them (ADR 0043). `UsageLimitsSync` keeps
 * them current.
 */
export function useUsageLimits(): UsageLimits {
  const { data } = useQuery(usageLimitsQuery);
  return data ?? unknown;
}
