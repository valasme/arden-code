import { useQuery } from "@tanstack/react-query";

import type { AgentKind } from "@/ipc/bindings";
import { agentsQuery } from "@/ipc/queries";

/**
 * The agents whose agent CLI Arden Code did not find, so the agent menu lists them without offering
 * them. Until it has looked, none: the Demo agent is always there.
 */
export function useUnavailableAgents(): AgentKind[] {
  const { data } = useQuery(agentsQuery);
  return (data ?? []).some((agent) => agent.cli === "claude" && !agent.installed) ? ["claude"] : [];
}
