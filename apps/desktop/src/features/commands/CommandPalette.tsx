import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { defaultFilter } from "cmdk";
import { MessageSquareIcon } from "lucide-react";
import { useState } from "react";
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
import { paletteSessions, type PaletteSession } from "@/features/sessions/sessionList";
import { noSessions, sessionListQuery } from "@/ipc/queries";
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

/** What a session's item in the palette is known by, apart from every command's. */
const sessionValue = (id: string) => `session:${id}`;

/**
 * Commands are scored by the palette's own filter. Sessions were filtered already
 * (`paletteSessions`), so each one that is listed gets the same small score: they stay after the
 * commands, the most recently used first.
 */
function filter(value: string, search: string, keywords?: string[]): number {
  return value.startsWith("session:") ? 0.001 : defaultFilter(value, search, keywords);
}

/** A session the palette offers: choosing it opens the session. */
function SessionItem({ session, onOpen }: { session: PaletteSession; onOpen: () => void }) {
  const { t } = useTranslation();

  return (
    <CommandItem
      value={sessionValue(session.id)}
      aria-label={t("palette.session", { session: session.name, project: session.project })}
      onSelect={onOpen}
    >
      <MessageSquareIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
      <span className="min-w-0 truncate">{session.name}</span>
      <span className="ms-auto shrink-0 text-xs text-muted-foreground">{session.project}</span>
    </CommandItem>
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const found = paletteSessions(list, search, t("sessions.untitled"));
  const openSession = (id: string) => {
    setOpen(false);
    void navigate({ to: "/session/$id", params: { id } });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        setOpen(next);
      }}
    >
      <DialogContent
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 shadow-lg sm:max-w-[40rem]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("palette.title")}</DialogTitle>
          <DialogDescription>{t("palette.description")}</DialogDescription>
        </DialogHeader>
        <Command filter={filter}>
          <CommandInput
            placeholder={t("palette.placeholder")}
            value={search}
            onValueChange={setSearch}
          />
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
            {found.recent.length > 0 ? (
              <CommandGroup heading={t("palette.sessions")}>
                {found.recent.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    onOpen={() => {
                      openSession(session.id);
                    }}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {found.archived.length > 0 ? (
              <CommandGroup heading={t("palette.archived")}>
                {found.archived.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    onOpen={() => {
                      openSession(session.id);
                    }}
                  />
                ))}
              </CommandGroup>
            ) : null}
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
