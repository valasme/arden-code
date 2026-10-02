import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

/** Keys (written as in a shortcut, such as `ArrowUp`) and what they do, along the bottom of the palette. */
function Hint({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((key) => (
        <Kbd key={key}>{formatShortcut(key)}</Kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

/**
 * Search for any command and run it (Ctrl+K). It reads the same registry as everything else, and
 * lists the commands in their groups (ADR 0032): wide, high on the screen, with a large search line.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useOverlayStore((state) => state.paletteOpen);
  const setOpen = useOverlayStore((state) => state.setPaletteOpen);
  const { commands, run } = useCommands();
  const enabled = commands.filter((command) => command.enabled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 shadow-lg sm:max-w-[40rem]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("palette.title")}</DialogTitle>
          <DialogDescription>{t("palette.description")}</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder={t("palette.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("palette.empty")}</CommandEmpty>
            {commandGroups.map((group) => (
              <CommandGroup key={group} heading={t(`commandGroups.${group}`)}>
                {enabled
                  .filter((command) => command.group === group)
                  .map((command) => {
                    const Icon = command.icon;
                    const label = t(command.labelKey);
                    const [shortcut] = command.shortcuts;
                    return (
                      <CommandItem
                        key={command.id}
                        value={label}
                        onSelect={() => {
                          setOpen(false);
                          run(command.id);
                        }}
                      >
                        <Icon
                          aria-hidden
                          className="size-4 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        {label}
                        {shortcut ? (
                          <Kbd data-slot="command-shortcut" className="ms-auto">
                            {formatShortcut(shortcut)}
                          </Kbd>
                        ) : null}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div
          aria-hidden
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-2xs text-muted-foreground"
        >
          <Hint keys={["ArrowUp", "ArrowDown"]} label={t("palette.hints.move")} />
          <Hint keys={["Enter"]} label={t("palette.hints.run")} />
          <Hint keys={["Escape"]} label={t("palette.hints.close")} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
