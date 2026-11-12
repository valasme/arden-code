import type { LucideIcon, LucideProps } from "lucide-react";
import { forwardRef } from "react";

import claudeSymbol from "../../../../../brand/reference/agents/claude-symbol.svg";

/** The supplied artwork, rendered as an image so UI stroke and color never change it (ADR 0064). */
export const ClaudeLogo: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function ClaudeLogo(
  { size = 24, ...props },
  ref,
) {
  return (
    <svg
      {...props}
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href={claudeSymbol} width="100" height="100" />
    </svg>
  );
});
