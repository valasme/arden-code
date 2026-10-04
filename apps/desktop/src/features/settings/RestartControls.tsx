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

/** Says a change waits for a restart, and offers to do it now. */
export function RestartNote({ note }: { note: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-muted-foreground">{note}</p>
      <Button size="sm" variant="outline" onClick={restartApp}>
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
 * what the app started with asks whether to restart now, and a note stays until it does.
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
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <ToggleControl
        id={id}
        checked={checked}
        onChange={(value) => {
          onChange(value);
          setAsking(value !== startedWith);
        }}
      />
      {checked === startedWith ? null : <RestartNote note={t("settings.restart.note")} />}
      <RestartPrompt open={asking} onOpenChange={setAsking} description={prompt} />
    </div>
  );
}
