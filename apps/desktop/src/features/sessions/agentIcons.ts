import { FlaskConicalIcon, type LucideIcon } from "lucide-react";

import type { AgentKind } from "@/ipc/bindings";

import { ClaudeLogo } from "./ClaudeLogo";
import { CodexLogo } from "./CodexLogo";

/** Supplied artwork identifies Claude; the Demo agent keeps its flask (ADR 0064). */
export const agentIcons: Record<AgentKind, LucideIcon> = {
  claude: ClaudeLogo,
  codex: CodexLogo,
  demo: FlaskConicalIcon,
};
