import { CpuIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Model } from "@/ipc/bindings";

import { ChoiceButton } from "./ChoiceButton";

/** The models Claude can work with, by Claude Code's aliases, in the order the menu lists them. */
const models = ["fable", "opus", "sonnet", "haiku"] as const satisfies readonly Model[];

/** The menu's value for Default, which leaves the model to Claude Code's own setting. */
const DEFAULT = "default";

interface ModelMenuProps {
  /** The session's model, or null for Default. */
  model: Model | null;
  /** While a reply runs, the model waits. */
  disabled?: boolean;
  onChoose: (model: Model | null) => void;
}

/**
 * The model of a Claude session, in the message box's lower line (ADR 0041): Default, which is
 * Claude Code's own setting, or one of its families by alias. It can change between messages.
 */
export function ModelMenu({ model, disabled = false, onChoose }: ModelMenuProps) {
  const { t } = useTranslation();
  const name = t(`sessions.modelMenu.${model ?? DEFAULT}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <ChoiceButton
          icon={CpuIcon}
          value={name}
          aria-label={t("sessions.modelMenu.label", { model: name })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuRadioGroup
          value={model ?? DEFAULT}
          onValueChange={(value) => {
            onChoose(models.find((known) => known === value) ?? null);
          }}
        >
          <DropdownMenuRadioItem value={DEFAULT}>
            <span className="flex flex-col">
              <span data-name>{t("sessions.modelMenu.default")}</span>
              <span className="text-xs text-muted-foreground">
                {t("sessions.modelMenu.defaultHint")}
              </span>
            </span>
          </DropdownMenuRadioItem>
          {models.map((known) => (
            <DropdownMenuRadioItem key={known} value={known}>
              <span data-name>{t(`sessions.modelMenu.${known}`)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
