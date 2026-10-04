import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The button of a choice in the message box's lower line (the agent, the project, the model, the
 * effort): outlined, with an icon, what is chosen and a chevron, so it reads as a control and not
 * as a caption. Its accessible name says what it chooses and what is chosen.
 */
export function ChoiceButton({
  icon: Icon,
  value,
  className,
  ...props
}: ComponentProps<typeof Button> & { icon: LucideIcon; value: string }) {
  return (
    <Button
      variant="outline"
      size="xs"
      className={cn("min-w-0 font-normal text-foreground", className)}
      {...props}
    >
      <Icon aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
      <span className="truncate">{value}</span>
      <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
    </Button>
  );
}
