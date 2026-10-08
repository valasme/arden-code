import { BrainIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Model } from "@/ipc/bindings";

import { ChoiceMenu } from "./ChoiceMenu";

/** The models Claude can work with, by Claude Code's aliases, in the order the menu lists them. */
const models = ["fable", "opus", "sonnet", "haiku"] as const satisfies readonly Model[];

/**
 * The model of a Claude session, in the message box's lower line (ADR 0041): Default, which is
 * Claude Code's own setting, or one of its families by alias. It can change between messages.
 */
export function ModelMenu({
  model,
  disabled = false,
  onChoose,
}: {
  /** The session's model, or null for Default. */
  model: Model | null;
  disabled?: boolean;
  onChoose: (model: Model | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <ChoiceMenu
      icon={BrainIcon}
      label={(name) => t("sessions.modelMenu.label", { model: name })}
      options={models.map((value) => ({ value, name: t(`sessions.modelMenu.${value}`) }))}
      value={model}
      disabled={disabled}
      onChoose={onChoose}
    />
  );
}
