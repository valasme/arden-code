import { WrenchIcon } from "lucide-react";
import { use } from "react";
import { useTranslation } from "react-i18next";

import type { ToolStatus } from "@/ipc/bindings";
import { useDisclosure } from "@/lib/disclosure";
import { cn } from "@/lib/utils";

import { TranscriptViewContext } from "../transcriptView";
import { itemLine } from "./itemLine";

interface ToolCallItemProps {
  name: string;
  input: string;
  status: ToolStatus;
  output: string | null;
}

/**
 * The agent using a tool: what it asked for, whether it worked, and what came back. What came back
 * is folded under the line until the person opens it, and open in the Verbose view, which also
 * shows what was asked for in full rather than cut to one line (ADR 0051).
 */
export function ToolCallItem({ name, input, status, output }: ToolCallItemProps) {
  const { t } = useTranslation();
  const verbose = use(TranscriptViewContext) === "verbose";
  const disclosure = useDisclosure(verbose);

  const line = (
    <>
      <WrenchIcon
        aria-hidden
        className="mt-[5px] size-3.5 shrink-0 self-start text-muted-foreground"
        strokeWidth={1.5}
      />
      <code className="font-medium">{name}</code>
      <code
        className={cn(
          "min-w-0 flex-1 text-muted-foreground",
          verbose ? "break-all whitespace-pre-wrap" : "truncate",
        )}
      >
        {input}
      </code>
      <span
        className={cn(
          "shrink-0",
          status === "failed" ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {t(`items.tool.${status}`)}
      </span>
    </>
  );

  if (!output) {
    return (
      <div data-item="toolCall" className={itemLine}>
        <div className="flex min-h-6 items-center gap-2">{line}</div>
      </div>
    );
  }
  return (
    <details {...disclosure} data-item="toolCall" className={itemLine}>
      <summary className="flex min-h-6 list-none items-center gap-2 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        {line}
      </summary>
      <p className="ps-5.5 pb-0.5 font-mono break-words whitespace-pre-wrap text-muted-foreground">
        {output}
      </p>
    </details>
  );
}
