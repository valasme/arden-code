import { FlaskConicalIcon, SparkleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentKind } from "@/ipc/bindings";

import { ChoiceButton } from "./ChoiceButton";

/** The agents a session can have, in the order the menu lists them (ADR 0039). */
export const agentKinds = ["claude", "demo"] as const satisfies readonly AgentKind[];

interface AgentMenuProps {
  agent: AgentKind;
  /** Agents whose agent CLI is not installed: listed, but not offered. */
  unavailable?: readonly AgentKind[];
  onChoose: (agent: AgentKind) => void;
}

/**
 * The agent of a session that has had no message yet, in the message box's lower line (ADR 0039):
 * a button with the agent's name, and a menu of the agents to choose from.
 */
/** No agent is missing. */
const none: readonly AgentKind[] = [];

export function AgentMenu({ agent, unavailable = none, onChoose }: AgentMenuProps) {
  const { t } = useTranslation();
  const name = t(`agents.${agent}.name`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ChoiceButton
          icon={agent === "claude" ? SparkleIcon : FlaskConicalIcon}
          value={name}
          aria-label={t("sessions.agentMenu.label", { agent: name })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuRadioGroup
          value={agent}
          onValueChange={(value) => {
            const picked = agentKinds.find((kind) => kind === value);
            if (picked !== undefined) onChoose(picked);
          }}
        >
          {agentKinds.map((kind) => {
            const missing = unavailable.includes(kind);
            return (
              <DropdownMenuRadioItem key={kind} value={kind} disabled={missing}>
                {t(`agents.${kind}.name`)}
                {missing ? (
                  <span className="ms-auto ps-4 text-xs text-muted-foreground">
                    {t("sessions.agentMenu.notInstalled")}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
