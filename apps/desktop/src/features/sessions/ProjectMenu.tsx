import { ChevronDownIcon, FolderOpenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/ipc/bindings";

interface ProjectMenuProps {
  /** The project the session works in. */
  projectId: string;
  /** Every project, the Playground first. */
  projects: Project[];
  onChoose: (projectId: string) => void;
  onOpenFolder: () => void;
}

/**
 * The project of a session that has had no message yet, in the message box's lower line (ADR 0039):
 * a quiet button with the project's name, and a menu of the projects, ending with Open folder.
 */
export function ProjectMenu({ projectId, projects, onChoose, onOpenFolder }: ProjectMenuProps) {
  const { t } = useTranslation();
  const nameOf = (project: Project) =>
    project.kind === "playground" ? t("sessions.playground") : project.name;
  const current = projects.find((project) => project.id === projectId);
  const name = current ? nameOf(current) : t("sessions.playground");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="min-w-0 text-muted-foreground"
          aria-label={t("sessions.projectMenu.label", { project: name })}
        >
          <span className="truncate">{name}</span>
          <ChevronDownIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={projectId} onValueChange={onChoose}>
          {projects.map((project) => (
            <DropdownMenuRadioItem key={project.id} value={project.id} title={project.path}>
              {nameOf(project)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenFolder}>
          <FolderOpenIcon aria-hidden strokeWidth={1.5} />
          {t("sessions.projectMenu.openFolder")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
