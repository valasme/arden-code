import { RotateCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { ToggleControl } from "./controls";

/** Starts the app again. Nothing comes back from a restart, so there is nothing to wait for. */
export function restartApp() {
  commands.restartApp().catch((error: unknown) => {
    showErrorToast(toAppError(error));
  });
}

/**
 * Says a setting's change waits for a restart, and offers to do it now: a quiet strip across the
 * foot of the setting's row, the words under its name and Restart now under its control (#130).
 * Nothing while the setting is as Arden Code started with it.
 */
export function RestartNote({ changed }: { changed: boolean }) {
  const { t } = useTranslation();
  if (!changed) return null;

  return (
    <div className="flex basis-full flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-muted py-1.5 ps-3 pe-1.5 forced-colors:border forced-colors:border-[CanvasText]">
      <p className="flex items-center gap-2 text-xs">
        <RotateCwIcon aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        {t("settings.restart.note")}
      </p>
      <Button size="xs" variant="outline" className="bg-background" onClick={restartApp}>
        {t("settings.restart.now")}
      </Button>
    </div>
  );
}

/** Asks whether to restart now for a change that needs it. */
export function RestartPrompt({
  open,
  onOpenChange,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
}) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.restart.title")}
      description={description}
      confirmLabel={t("settings.restart.now")}
      cancelLabel={t("settings.restart.later")}
      onConfirm={restartApp}
    />
  );
}

/**
 * A switch for a setting that only takes effect when Arden Code starts again: changing it away from
 * what the app started with asks whether to restart now. The setting's `RestartNote` says so
 * until it does.
 */
export function RestartToggle({
  id,
  checked,
  startedWith,
  prompt,
  onChange,
}: {
  id: string;
  checked: boolean;
  /** The value Arden Code started with, which is the one in effect. */
  startedWith: boolean;
  /** Says what changes the next time Arden Code starts. */
  prompt: string;
  onChange: (checked: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);

  // At the end of the row like every other control (ADR 0032).
  return (
    <>
      <ToggleControl
        id={id}
        checked={checked}
        onChange={(value) => {
          onChange(value);
          setAsking(value !== startedWith);
        }}
      />
      <RestartPrompt open={asking} onOpenChange={setAsking} description={prompt} />
    </>
  );
}
