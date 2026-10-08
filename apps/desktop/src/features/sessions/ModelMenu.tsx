import { BrainIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Model, ModelOption } from "@/ipc/bindings";

import { splitModels } from "./claudeCatalog";
import { type ChoiceOption, ChoiceMenu } from "./ChoiceMenu";

/** Claude Code's models, before it has listed any. */
const noModels: readonly ModelOption[] = [];

/** A model Claude Code lists, as a choice: its name, with what it says about it under it. */
const optionOf = (row: ModelOption): ChoiceOption<Model> => ({
  value: row.value,
  name: row.displayName,
  ...(row.description ? { hint: row.description } : {}),
});

/** The families Claude can work with, by Claude Code's aliases, until Claude Code lists its models. */
const families = ["fable", "opus", "sonnet", "haiku"] as const;

/**
 * The model of a Claude session, in the message box's lower line (ADR 0041, ADR 0042): Default,
 * which is Claude Code's own setting, or one of the models Claude Code lists, the families first
 * and the older versions after. It can change between messages.
 */
export function ModelMenu({
  model,
  models = noModels,
  disabled = false,
  onChoose,
}: {
  /** The session's model, or null for Default. */
  model: Model | null;
  /** The models Claude Code lists. Until it has, the four families. */
  models?: readonly ModelOption[];
  disabled?: boolean;
  onChoose: (model: Model | null) => void;
}) {
  const { t } = useTranslation();
  const { listed, older } = splitModels(models);
  const options: ChoiceOption<Model>[] =
    models.length > 0
      ? listed.map(optionOf)
      : families.map((value) => ({ value, name: t(`sessions.modelMenu.${value}`) }));

  return (
    <ChoiceMenu
      icon={BrainIcon}
      label={(name) => t("sessions.modelMenu.label", { model: name })}
      options={options}
      more={{ heading: t("sessions.modelMenu.older"), options: older.map(optionOf) }}
      value={model}
      disabled={disabled}
      onChoose={onChoose}
    />
  );
}
