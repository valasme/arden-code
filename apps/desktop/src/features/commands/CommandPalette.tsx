import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
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

/** Search for any command and run it (Ctrl+K). It reads the same registry as everything else. */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useOverlayStore((state) => state.paletteOpen);
  const setOpen = useOverlayStore((state) => state.setPaletteOpen);
  const { commands, run } = useCommands();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("palette.title")}</DialogTitle>
          <DialogDescription>{t("palette.description")}</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder={t("palette.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("palette.empty")}</CommandEmpty>
            {commands
              .filter((command) => command.enabled)
              .map((command) => {
                const Icon = command.icon;
                const label = t(command.labelKey);
                return (
                  <CommandItem
                    key={command.id}
                    value={label}
                    onSelect={() => {
                      setOpen(false);
                      run(command.id);
                    }}
                  >
                    <Icon aria-hidden className="size-4" strokeWidth={1.5} />
                    {label}
                    {command.shortcuts[0] ? (
                      <CommandShortcut>{formatShortcut(command.shortcuts[0])}</CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
