import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOverlayStore } from "@/state/overlays";

import { useCommands } from "./CommandsProvider";
import { formatShortcut } from "./shortcuts";

/** Every shortcut and the command it runs (Ctrl+/). */
export function CheatSheet() {
  const { t } = useTranslation();
  const open = useOverlayStore((state) => state.cheatSheetOpen);
  const setOpen = useOverlayStore((state) => state.setCheatSheetOpen);
  const { commands } = useCommands();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cheatSheet.title")}</DialogTitle>
          <DialogDescription>{t("cheatSheet.description")}</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 font-medium">
                {t("cheatSheet.command")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t("cheatSheet.shortcut")}
              </th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => (
              <tr key={command.id} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                  {t(command.labelKey)}
                </th>
                <td className="py-1.5">
                  <span className="flex flex-wrap gap-2">
                    {command.shortcuts.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("cheatSheet.none")}</span>
                    ) : null}
                    {command.shortcuts.map((shortcut) => (
                      <kbd
                        key={shortcut}
                        className="border border-border bg-muted px-1.5 py-0.5 font-sans text-xs"
                      >
                        {formatShortcut(shortcut)}
                      </kbd>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
