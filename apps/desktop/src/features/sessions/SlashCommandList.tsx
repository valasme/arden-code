import { useTranslation } from "react-i18next";

import type { SlashCommand } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

import { sourceOf } from "./slashCommands";

/** The id of the option at a position of the list, for the text box to name as its active one. */
export const slashOptionId = (listId: string, index: number) => `${listId}-${index}`;

/**
 * The slash commands that match what is typed, above the message box (ADR 0042): each with its
 * name, what it takes, what it does and where it comes from. The text box stays focused and names
 * the active option, so a click takes a command without moving the focus.
 */
export function SlashCommandList({
  id,
  matches,
  active,
  onTake,
  onHover,
}: {
  id: string;
  matches: readonly SlashCommand[];
  /** The position of the highlighted option. */
  active: number;
  onTake: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useTranslation();
  // Each name has its own key, so the translations can be found and checked.
  const sourceNames = {
    builtin: t("sessions.slash.source.builtin"),
    mcp: t("sessions.slash.source.mcp"),
    skill: t("sessions.slash.source.skill"),
  };

  return (
    <ul
      id={id}
      data-slash-menu
      // The list a text box controls, which a native select cannot be.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role
      role="listbox"
      aria-label={t("sessions.slash.label")}
      className="absolute inset-x-0 bottom-full z-10 max-h-64 overflow-auto border border-input bg-popover py-1 text-popover-foreground"
    >
      {matches.length === 0 ? (
        <li role="presentation" className="px-3 py-1.5 text-xs text-muted-foreground">
          {t("sessions.slash.none")}
        </li>
      ) : (
        matches.map((command, index) => {
          const source = sourceOf(command);
          return (
            <li
              key={command.name}
              id={slashOptionId(id, index)}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-sm",
                index === active && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(event) => {
                // The box keeps the focus.
                event.preventDefault();
                onTake(command);
              }}
              onMouseMove={() => {
                onHover(index);
              }}
            >
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
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {command.description}
                </span>
              ) : null}
            </li>
          );
        })
      )}
    </ul>
  );
}
