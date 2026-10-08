import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChoiceButton } from "./ChoiceButton";

/** The menu's value for Default, which leaves the choice to the agent CLI's own setting. */
const DEFAULT = "default";

interface ChoiceMenuProps<Value extends string> {
  icon: LucideIcon;
  /** The button's accessible name, given the name of what is chosen, such as "Model: Opus". */
  label: (chosen: string) => string;
  /** What can be chosen besides Default, in order, with their names. */
  options: readonly { value: Value; name: string }[];
  /** What is chosen, or null for Default. */
  value: Value | null;
  /** While a reply runs, the choice waits. */
  disabled?: boolean;
  onChoose: (value: Value | null) => void;
  /** More of the menu, after the choices. */
  extra?: ReactNode;
}

/**
 * A choice in the message box's lower line that an agent CLI has a setting of its own for, such as
 * the model or the effort (ADR 0041): Default, which leaves it to that setting, then the options.
 */
export function ChoiceMenu<Value extends string>({
  icon,
  label,
  options,
  value,
  disabled = false,
  onChoose,
  extra,
}: ChoiceMenuProps<Value>) {
  const { t } = useTranslation();
  const name =
    options.find((option) => option.value === value)?.name ?? t("sessions.choiceMenu.default");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <ChoiceButton icon={icon} value={name} aria-label={label(name)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuRadioGroup
          value={value ?? DEFAULT}
          onValueChange={(picked) => {
            onChoose(options.find((option) => option.value === picked)?.value ?? null);
          }}
        >
          <DropdownMenuRadioItem value={DEFAULT}>
            <span className="flex flex-col">
              <span data-name>{t("sessions.choiceMenu.default")}</span>
              <span className="text-xs text-muted-foreground">
                {t("sessions.choiceMenu.defaultHint")}
              </span>
            </span>
          </DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span data-name>{option.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {extra}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
