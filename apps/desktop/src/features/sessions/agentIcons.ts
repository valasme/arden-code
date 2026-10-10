import { BotIcon, FlaskConicalIcon, type LucideIcon } from "lucide-react";

import type { AgentKind } from "@/ipc/bindings";

/** Each agent's icon: one of Arden Code's own, never a vendor's logo (ADR 0044). */
export const agentIcons: Record<AgentKind, LucideIcon> = {
  claude: BotIcon,
  demo: FlaskConicalIcon,
};
