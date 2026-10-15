import type { ReactNode } from "react";
import { FileIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FileMatch, SlashCommand } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

import { sourceOf } from "./slashCommands";

/** The id of the option at a position of the list, for the text box to name as its active one. */
export const optionId = (listId: string, index: number) => `${listId}-${index}`;

/**
 * The list above the message box, for the word under the cursor (ADR 0042, ADR 0052): the slash
 * commands or the files that match it. The text box stays focused and names the active option, so
 * a click takes an option without moving the focus. While the first answer is on its way, the list
 * is empty and says nothing.
 */
export function MessageBoxList({
  id,
  label,
  none,
  options,
  active,
  onTake,
  onHover,
}: {
  id: string;
  /** What the list holds, for a screen reader. */
  label: string;
  /** What the list says when nothing matches. */
  none: string;
  /** Each option's key and what it shows, or null while the matches are on their way. */
  options: readonly { key: string; content: ReactNode }[] | null;
  /** The position of the highlighted option. */
  active: number;
  onTake: (index: number) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      id={id}
      data-message-box-list
      // The list a text box controls, which a native select cannot be.
      role="listbox"
      aria-label={label}
      className="absolute inset-x-0 bottom-full z-10 max-h-64 overflow-auto rounded-lg border border-input bg-popover p-1 text-popover-foreground"
    >
      {options === null ? null : options.length === 0 ? (
        <li role="presentation" className="px-3 py-1.5 text-xs text-muted-foreground">
          {none}
        </li>
      ) : (
        options.map((option, index) => (
          <li
            key={option.key}
            id={optionId(id, index)}
            role="option"
            aria-selected={index === active}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-sm",
              index === active && "bg-accent text-accent-foreground",
            )}
            onMouseDown={(event) => {
              // The box keeps the focus.
              event.preventDefault();
              onTake(index);
            }}
            onMouseMove={() => {
              onHover(index);
            }}
          >
            {option.content}
          </li>
        ))
      )}
    </ul>
  );
}

/** A slash command's row: its name, what it takes, where it comes from and what it does. */
export function SlashCommandRow({ command }: { command: SlashCommand }) {
  const { t } = useTranslation();
  // Each name has its own key, so the translations can be found and checked.
  const sourceNames = {
    builtin: t("sessions.slash.source.builtin"),
    mcp: t("sessions.slash.source.mcp"),
    skill: t("sessions.slash.source.skill"),
  };
  const source = sourceOf(command);
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-xs">/{command.name}</span>
        {command.argumentHint ? (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {command.argumentHint}
          </span>
        ) : null}
        <span className="ms-auto shrink-0 text-xs text-muted-foreground">
          {source.kind === "plugin" ? source.name : sourceNames[source.kind]}
        </span>
      </span>
      {command.description ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">{command.description}</span>
      ) : null}
    </>
  );
}

/** A file's or folder's row: its path in the project, a folder marked as one. */
export function FileRow({ file }: { file: FileMatch }) {
  const { t } = useTranslation();
  const Icon = file.folder ? FolderIcon : FileIcon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="truncate font-mono text-xs">{file.path}</span>
      {file.folder ? <span className="sr-only"> {t("sessions.files.folder")}</span> : null}
    </span>
  );
}
