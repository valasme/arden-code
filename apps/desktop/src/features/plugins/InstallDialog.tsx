import { ShieldAlertIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AvailablePlugin } from "@/ipc/bindings";

/**
 * The install choices (ADR 0053, the prototype's variant A): who gets the plugin, each choice with
 * a line saying what it means, and the warning that a plugin can run programs on this computer.
 */
export function InstallDialog({
  plugin,
  open,
  onOpenChange,
  onInstall,
}: {
  plugin: AvailablePlugin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plugins.install.title", { name: plugin.name })}</DialogTitle>
          <DialogDescription>{t("plugins.install.who")}</DialogDescription>
        </DialogHeader>
        <RadioGroup value="user" aria-label={t("plugins.install.who")}>
          <div className="flex items-start gap-3 py-1">
            <RadioGroupItem id={`${id}-user`} value="user" className="mt-0.5" />
            <label htmlFor={`${id}-user`} className="flex flex-col gap-0.5">
              <span className="text-sm">{t("plugins.scope.user")}</span>
              <span className="text-xs text-muted-foreground">
                {t("plugins.install.userDetail")}
              </span>
            </label>
          </div>
        </RadioGroup>
        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t("plugins.discover.warning")}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("plugins.install.cancel")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onInstall();
            }}
          >
            {t("plugins.install.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
