import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { itemLine } from "./itemLine";

/** The agent's reasoning, folded away until the person opens it. */
export function ThinkingItem({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();

  return (
    <details data-item="thinking" className={cn(itemLine, "group text-muted-foreground")}>
      <summary className="flex min-h-6 list-none items-center gap-2 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 shrink-0 group-open:rotate-90"
          strokeWidth={1.5}
        />
        {streaming ? t("items.thinking.running") : t("items.thinking.done")}
      </summary>
      <p className="ps-5.5 pt-1 pb-0.5 whitespace-pre-wrap">{text}</p>
    </details>
  );
}
