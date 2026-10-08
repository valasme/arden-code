import { ChartNoAxesColumnIncreasingIcon, LightbulbIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { Effort } from "@/ipc/bindings";

import { ChoiceMenu } from "./ChoiceMenu";

/** How much Claude can think, in the order the menu lists them. */
const efforts = ["low", "medium", "high", "extraHigh", "max"] as const satisfies readonly Effort[];

/**
 * The effort of a Claude session, beside its model (ADR 0041): Default, which is Claude Code's own
 * setting, or Low to Max. It can change between messages.
 */
export function EffortMenu({
  effort,
  disabled = false,
  ultrathink,
  onUltrathink,
  onChoose,
}: {
  /** The session's effort, or null for Default. */
  effort: Effort | null;
  disabled?: boolean;
  /** Whether the next message carries the word ultrathink (ADR 0042). */
  ultrathink: boolean;
  onUltrathink: (on: boolean) => void;
  onChoose: (effort: Effort | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <ChoiceMenu
      icon={ChartNoAxesColumnIncreasingIcon}
      label={(name) => t("sessions.effortMenu.label", { effort: name })}
      options={efforts.map((value) => ({ value, name: t(`sessions.effortMenu.${value}`) }))}
      value={effort}
      disabled={disabled}
      onChoose={onChoose}
      extra={
        <>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={ultrathink}
            // The menu stays open, so the switch can be seen to change.
            onSelect={(event) => {
              event.preventDefault();
            }}
            onCheckedChange={onUltrathink}
          >
            <LightbulbIcon aria-hidden strokeWidth={1.5} />
            <span className="flex flex-col">
              <span>{t("sessions.effortMenu.ultrathink")}</span>
              <span className="text-xs text-muted-foreground">
                {t("sessions.effortMenu.ultrathinkHint")}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        </>
      }
    />
  );
}
