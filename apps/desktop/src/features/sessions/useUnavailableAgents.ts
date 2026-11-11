import { useQuery } from "@tanstack/react-query";

import type { AgentKind, Readiness } from "@/ipc/bindings";
import { agentsQuery } from "@/ipc/queries";

/**
 * The agents whose agent CLI Arden Code did not find, so the agent menu lists them without offering
 * them. Until it has looked, none: the Demo agent is always there.
 */
export function useUnavailableAgents(): {
  unavailable: AgentKind[];
  reasons: Partial<Record<AgentKind, Exclude<Readiness, "ready">>>;
} {
  const { data } = useQuery(agentsQuery);
  const unavailable: AgentKind[] = [];
  const reasons: Partial<Record<AgentKind, Exclude<Readiness, "ready">>> = {};
  if (data?.some((agent) => agent.cli === "claude" && !agent.installed)) {
    unavailable.push("claude");
    reasons.claude = "missing";
  }
  const codex = data?.find((agent) => agent.cli === "codex");
  if (codex?.readiness !== "ready") {
    unavailable.push("codex");
    reasons.codex = codex?.readiness ?? "unknown";
  }
  return { unavailable, reasons };
}
