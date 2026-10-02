import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useOverlayStore } from "@/state/overlays";

import { useCommands } from "./CommandsProvider";
import { commandGroups } from "./registry";
import { formatShortcut } from "./shortcuts";

/** Every shortcut and the command it runs (Ctrl+/), in the command palette's groups. */
export function CheatSheet() {
  const { t } = useTranslation();
  const open = useOverlayStore((state) => state.cheatSheetOpen);
  const setOpen = useOverlayStore((state) => state.setCheatSheetOpen);
  const { commands } = useCommands();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>{t("cheatSheet.title")}</DialogTitle>
          <DialogDescription>{t("cheatSheet.description")}</DialogDescription>
        </DialogHeader>
        {commandGroups.map((group) => (
          <table key={group} className="w-full text-sm">
            <caption className="pb-1 text-start text-2xs font-medium text-muted-foreground">
              {t(`commandGroups.${group}`)}
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">{t("cheatSheet.command")}</th>
                <th scope="col">{t("cheatSheet.shortcut")}</th>
              </tr>
            </thead>
            <tbody>
              {commands
                .filter((command) => command.group === group)
                .map((command) => (
                  <tr key={command.id} className="border-t border-border">
                    <th scope="row" className="py-1.5 pe-4 text-start font-normal">
                      {t(command.labelKey)}
                    </th>
                    <td className="py-1.5">
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {command.shortcuts.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t("cheatSheet.none")}
                          </span>
                        ) : null}
                        {command.shortcuts.map((shortcut) => (
                          <Kbd key={shortcut}>{formatShortcut(shortcut)}</Kbd>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ))}
      </DialogContent>
    </Dialog>
  );
}
