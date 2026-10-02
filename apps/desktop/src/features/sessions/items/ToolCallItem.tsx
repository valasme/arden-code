import { WrenchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ToolStatus } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

import { itemLine } from "./itemLine";

interface ToolCallItemProps {
  name: string;
  input: string;
  status: ToolStatus;
  output: string | null;
}

/** The agent using a tool: what it asked for, whether it worked, and what came back. */
export function ToolCallItem({ name, input, status, output }: ToolCallItemProps) {
  const { t } = useTranslation();

  return (
    <div data-item="toolCall" className={itemLine}>
      <div className="flex min-h-6 items-center gap-2">
        <WrenchIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <code className="font-medium">{name}</code>
        <code className="min-w-0 flex-1 truncate text-muted-foreground">{input}</code>
        <span
          className={cn(
            "shrink-0",
            status === "failed" ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {t(`items.tool.${status}`)}
        </span>
      </div>
      {output ? (
        <p className="ps-5.5 pb-0.5 font-mono break-words whitespace-pre-wrap text-muted-foreground">
          {output}
        </p>
      ) : null}
    </div>
  );
}
