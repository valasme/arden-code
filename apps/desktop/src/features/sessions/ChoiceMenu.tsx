import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChoiceButton } from "./ChoiceButton";

/** The menu's value for Default, which leaves the choice to the agent CLI's own setting. */
const DEFAULT = "default";

/** One thing that can be chosen. */
export interface ChoiceOption<Value extends string> {
  value: Value;
  name: string;
  /** A line under the name. */
  hint?: string;
}

interface ChoiceMenuProps<Value extends string> {
  icon: LucideIcon;
  /** The button's accessible name, given the name of what is chosen, such as "Model: Opus". */
  label: (chosen: string) => string;
  /** What can be chosen besides Default, in order, with their names. */
  options: readonly ChoiceOption<Value>[];
  /** More that can be chosen, after the others under a heading of their own. */
  more?: { heading: string; options: readonly ChoiceOption<Value>[] };
  /** What is chosen, or null for Default. */
  value: Value | null;
  /** While a reply runs, or when there is nothing to choose, the choice waits. */
  disabled?: boolean;
  onChoose: (value: Value | null) => void;
  /** More of the menu, after the choices. */
  extra?: ReactNode;
}

function Row<Value extends string>({ option }: { option: ChoiceOption<Value> }) {
  return (
    <DropdownMenuRadioItem value={option.value}>
      <span className="flex min-w-0 flex-col">
        <span data-name>{option.name}</span>
        {option.hint ? (
          <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
        ) : null}
      </span>
    </DropdownMenuRadioItem>
  );
}

/**
 * A choice in the message box's lower line that an agent CLI has a setting of its own for, such as
 * the model or the effort (ADR 0041): Default, which leaves it to that setting, then the options.
 * A value that is chosen but is not among the options, such as a model Claude Code no longer
 * lists, is kept, shown as it is, and marked.
 */
export function ChoiceMenu<Value extends string>({
  icon,
  label,
  options,
  more,
  value,
  disabled = false,
  onChoose,
  extra,
}: ChoiceMenuProps<Value>) {
  const { t } = useTranslation();
  const all = [...options, ...(more?.options ?? [])];
  const known = value === null ? undefined : all.find((option) => option.value === value);
  const unlisted = value !== null && known === undefined;
  const name = value === null ? t("sessions.choiceMenu.default") : (known?.name ?? value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <ChoiceButton icon={icon} value={name} aria-label={label(name)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-auto max-w-[28rem] min-w-48">
        <DropdownMenuRadioGroup
          value={value ?? DEFAULT}
          onValueChange={(picked) => {
            // The unlisted value is kept as it is.
            if (picked === value) return;
            onChoose(all.find((option) => option.value === picked)?.value ?? null);
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
            <Row key={option.value} option={option} />
          ))}
          {more && more.options.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {more.heading}
              </DropdownMenuLabel>
              {more.options.map((option) => (
                <Row key={option.value} option={option} />
              ))}
            </>
          ) : null}
          {unlisted && value !== null ? (
            <>
              <DropdownMenuSeparator />
              <Row option={{ value, name: value, hint: t("sessions.choiceMenu.unlisted") }} />
            </>
          ) : null}
        </DropdownMenuRadioGroup>
        {extra}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
