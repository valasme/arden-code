import { FileMinusIcon, FilePenIcon, FilePlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FileChangeKind } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

import { itemLine } from "./itemLine";

const icons = { created: FilePlusIcon, modified: FilePenIcon, deleted: FileMinusIcon } as const;

interface FileChangeItemProps {
  path: string;
  change: FileChangeKind;
  added: number;
  removed: number;
}

/** A file the agent created, changed or deleted, with how many lines were added and removed. */
export function FileChangeItem({ path, change, added, removed }: FileChangeItemProps) {
  const { t } = useTranslation();
  const Icon = icons[change];

  return (
    <div data-item="fileChange" className={cn(itemLine, "flex min-h-8 items-center gap-2")}>
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="text-muted-foreground">{t(`items.file.${change}`)}</span>
      <code className="min-w-0 flex-1 truncate">{path}</code>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        <span aria-hidden>
          +{added} −{removed}
        </span>
        <span className="sr-only">{t("items.file.lines", { added, removed })}</span>
      </span>
    </div>
  );
}
