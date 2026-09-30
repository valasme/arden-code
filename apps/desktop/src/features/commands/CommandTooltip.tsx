import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { type CommandId, definitionOf } from "./registry";
import { formatShortcut } from "./shortcuts";

/**
 * A tooltip for the control that runs a command: the command's name and its shortcut, both read
 * from the registry so they can never disagree with what the shortcut does.
 */
export function CommandTooltip({ command, children }: { command: CommandId; children: ReactNode }) {
  const { t } = useTranslation();
  const { labelKey, shortcuts } = definitionOf(command);

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>
          {t(labelKey)}
          {shortcuts[0] ? (
            <kbd className="ml-2 font-sans opacity-80">{formatShortcut(shortcuts[0])}</kbd>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
