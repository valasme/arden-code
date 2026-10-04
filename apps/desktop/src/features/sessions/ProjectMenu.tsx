import { FolderIcon, FolderOpenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import { formatShortcut } from "@/features/commands/shortcuts";
import type { Project } from "@/ipc/bindings";

import { ChoiceButton } from "./ChoiceButton";

interface ProjectMenuProps {
  /** The project the session works in. */
  projectId: string;
  /** Every project, in the order the menu lists them: the Playground first. */
  projects: readonly Project[];
  onChoose: (projectId: string) => void;
  onOpenFolder: () => void;
}

/**
 * The project of a session that has had no message yet, in the message box's lower line (ADR 0039):
 * a button with the project's name, and a menu of the projects, each with its path, ending with
 * Open folder.
 */
export function ProjectMenu({ projectId, projects, onChoose, onOpenFolder }: ProjectMenuProps) {
  const { t } = useTranslation();
  const [openFolderShortcut] = useShortcutsOf("folder.open");
  const nameOf = (project: Project) =>
    project.kind === "playground" ? t("sessions.playground") : project.name;
  const current = projects.find((project) => project.id === projectId);
  const name = current ? nameOf(current) : t("sessions.playground");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ChoiceButton
          icon={FolderIcon}
          value={name}
          aria-label={t("sessions.projectMenu.label", { project: name })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto max-w-[28rem] min-w-56">
        <DropdownMenuRadioGroup value={projectId} onValueChange={onChoose}>
          {projects.map((project) => (
            <DropdownMenuRadioItem key={project.id} value={project.id}>
              <span className="flex min-w-0 flex-col">
                <span data-name>{nameOf(project)}</span>
                <span className="truncate text-xs text-muted-foreground">{project.path}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenFolder}>
          <FolderOpenIcon aria-hidden strokeWidth={1.5} />
          {t("sessions.projectMenu.openFolder")}
          {openFolderShortcut ? (
            <Kbd className="ms-auto">{formatShortcut(openFolderShortcut)}</Kbd>
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
