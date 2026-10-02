import * as React from "react";
import { cn } from "cn";

/** A key, or a combination of keys, drawn as a key cap: how every shortcut is shown. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 shrink-0 items-center border border-border bg-muted px-1.5 font-sans text-2xs leading-none font-normal text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
