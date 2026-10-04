import { Trash2Icon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * What can be done to a folder project from the sidebar (#72): Remove project…, which asks first.
 * Also the items of the menu a right click on the project's name opens. The choice is acted on once
 * the menu has closed and given the focus back, so the question can give it back there too.
 */
export function ProjectMenuItems({ onRemove }: { onRemove: () => void }) {
  const { t } = useTranslation();

  return (
    <DropdownMenuItem variant="destructive" onSelect={onRemove}>
      <Trash2Icon aria-hidden strokeWidth={1.5} />
      {t("projects.remove.action")}
    </DropdownMenuItem>
  );
}

/** The menu of a folder project, opened from the … button on its name in the sidebar. */
export function ProjectActionsMenu({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: ReactNode;
}) {
  const chosen = useRef(false);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48"
        onCloseAutoFocus={() => {
          if (!chosen.current) return;
          chosen.current = false;
          onRemove();
        }}
      >
        <ProjectMenuItems
          onRemove={() => {
            chosen.current = true;
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
