import * as React from "react";
import { cn } from "cn";
import { Switch as SwitchPrimitive } from "radix-ui";

/**
 * On or off (ADR 0032): a bordered square track with a square thumb inset by 2px. Off is a gray
 * thumb at the start; on fills the track and moves the thumb to the end.
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-none border border-input bg-background p-0.5 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 aria-invalid:border-destructive data-[size=default]:h-[18px] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 forced-colors:border-[CanvasText] forced-colors:data-checked:bg-[Highlight]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block aspect-square h-full rounded-none bg-muted-foreground data-checked:ms-auto data-checked:bg-primary-foreground forced-colors:bg-[CanvasText] forced-colors:data-checked:bg-[HighlightText]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
