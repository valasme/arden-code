import { Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

/**
 * What can be done to a folder project from the sidebar (#72): Remove project…, which asks first.
 * Also the items of the menu a right click on the project's name opens.
 */
export function ProjectMenuItems({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const askToRemove = useSessionDialogsStore((state) => state.askToRemove);

  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={() => {
        askToRemove(projectId);
      }}
    >
      <Trash2Icon aria-hidden strokeWidth={1.5} />
      {t("projects.remove.action")}
    </DropdownMenuItem>
  );
}

/** The menu of a folder project, opened from the ••• button on its name in the sidebar. */
export function ProjectActionsMenu({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        <ProjectMenuItems projectId={projectId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
