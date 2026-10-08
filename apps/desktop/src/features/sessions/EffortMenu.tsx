import { ChartNoAxesColumnIncreasingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  onChoose,
}: {
  /** The session's effort, or null for Default. */
  effort: Effort | null;
  disabled?: boolean;
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
    />
  );
}
