import { ShieldIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PermissionMode } from "@/ipc/bindings";

import { ChoiceButton } from "./ChoiceButton";

/** The modes, in the menu's order: the digit that chooses each is its place. */
export const permissionModes: readonly PermissionMode[] = [
  "manual",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
];

/**
 * How far a Claude session's agent may go without asking (ADR 0044), after the effort: Manual,
 * Accept edits, Plan, Auto and Bypass permissions, each saying what it does, chosen by its digit
 * while the menu is open. Unlike the model, it can change while a reply runs: Claude Code takes it
 * at once. Bypass permissions stays unavailable until Settings → Agents allows it.
 */
export function PermissionModeMenu({
  mode,
  bypassAllowed = false,
  onChoose,
}: {
  mode: PermissionMode;
  /** Whether Settings → Agents allows Bypass permissions. */
  bypassAllowed?: boolean;
  onChoose: (mode: PermissionMode) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Each name and line has its own key, so the translations can be found and checked.
  const names: Record<PermissionMode, string> = {
    manual: t("sessions.permissionModeMenu.manual"),
    acceptEdits: t("sessions.permissionModeMenu.acceptEdits"),
    plan: t("sessions.permissionModeMenu.plan"),
    auto: t("sessions.permissionModeMenu.auto"),
    bypassPermissions: t("sessions.permissionModeMenu.bypassPermissions"),
  };
  const hints: Record<PermissionMode, string> = {
    manual: t("sessions.permissionModeMenu.manualHint"),
    acceptEdits: t("sessions.permissionModeMenu.acceptEditsHint"),
    plan: t("sessions.permissionModeMenu.planHint"),
    auto: t("sessions.permissionModeMenu.autoHint"),
    bypassPermissions: bypassAllowed
      ? t("sessions.permissionModeMenu.bypassPermissionsHint")
      : t("sessions.permissionModeMenu.bypassPermissionsOff"),
  };
  const available = (value: PermissionMode) => value !== "bypassPermissions" || bypassAllowed;
  const choose = (value: PermissionMode) => {
    if (value !== mode && available(value)) onChoose(value);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ChoiceButton
          icon={ShieldIcon}
          value={names[mode]}
          aria-label={t("sessions.permissionModeMenu.label", { mode: names[mode] })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-auto max-w-[28rem] min-w-48"
        onKeyDown={(event) => {
          const picked = permissionModes[Number(event.key) - 1];
          if (picked === undefined || !available(picked)) return;
          event.preventDefault();
          setOpen(false);
          choose(picked);
        }}
      >
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(picked) => {
            const value = permissionModes.find((known) => known === picked);
            if (value) choose(value);
          }}
        >
          {permissionModes.map((value, index) => (
            <DropdownMenuRadioItem key={value} value={value} disabled={!available(value)}>
              <span className="flex min-w-0 flex-col">
                <span data-name>{names[value]}</span>
                <span className="text-xs text-muted-foreground">{hints[value]}</span>
              </span>
              <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
