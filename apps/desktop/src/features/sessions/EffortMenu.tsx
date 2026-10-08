import { ChartNoAxesColumnIncreasingIcon, LightbulbIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { Effort } from "@/ipc/bindings";

import { allEfforts } from "./claudeCatalog";
import { ChoiceMenu } from "./ChoiceMenu";

/**
 * The effort of a Claude session, beside its model (ADR 0041): Default, which is Claude Code's own
 * setting, or the efforts the model takes, Low to Max (ADR 0042). It can change between messages.
 * It ends with the Ultrathink switch, for the next message.
 */
export function EffortMenu({
  effort,
  levels = allEfforts,
  disabled = false,
  ultrathink,
  onUltrathink,
  onChoose,
}: {
  /** The session's effort, or null for Default. */
  effort: Effort | null;
  /** The efforts the session's model takes. None for a model that has no effort. */
  levels?: readonly Effort[];
  disabled?: boolean;
  /** Whether the next message carries the word ultrathink (ADR 0042). */
  ultrathink: boolean;
  onUltrathink: (on: boolean) => void;
  onChoose: (effort: Effort | null) => void;
}) {
  const { t } = useTranslation();
  // Each name has its own key, so the translations can be found and checked.
  const names: Record<Effort, string> = {
    low: t("sessions.effortMenu.low"),
    medium: t("sessions.effortMenu.medium"),
    high: t("sessions.effortMenu.high"),
    extraHigh: t("sessions.effortMenu.extraHigh"),
    max: t("sessions.effortMenu.max"),
  };

  return (
    <ChoiceMenu
      icon={ChartNoAxesColumnIncreasingIcon}
      label={(name) => t("sessions.effortMenu.label", { effort: name })}
      // A chosen effort that the model does not take stays visible: Claude Code runs the highest
      // effort at or below it.
      options={allEfforts
        .filter((value) => levels.includes(value) || value === effort)
        .map((value) => ({ value, name: names[value] }))}
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
