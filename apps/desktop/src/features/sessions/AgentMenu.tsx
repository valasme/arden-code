import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentKind } from "@/ipc/bindings";

/** The agents a session can have, in the order the menu lists them (ADR 0039). */
export const agentKinds = ["claude", "demo"] as const satisfies readonly AgentKind[];

interface AgentMenuProps {
  agent: AgentKind;
  onChoose: (agent: AgentKind) => void;
}

/**
 * The agent of a session that has had no message yet, in the message box's lower line (ADR 0039):
 * a quiet button with the agent's name, and a menu of the agents to choose from.
 */
export function AgentMenu({ agent, onChoose }: AgentMenuProps) {
  const { t } = useTranslation();
  const name = t(`agents.${agent}.name`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="-ms-2 text-muted-foreground"
          aria-label={t("sessions.agentMenu.label", { agent: name })}
        >
          {name}
          <ChevronDownIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={agent}
          onValueChange={(value) => {
            const picked = agentKinds.find((kind) => kind === value);
            if (picked !== undefined) onChoose(picked);
          }}
        >
          {agentKinds.map((kind) => (
            <DropdownMenuRadioItem key={kind} value={kind}>
              {t(`agents.${kind}.name`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
