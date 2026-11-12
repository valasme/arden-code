import type { LucideIcon, LucideProps } from "lucide-react";
import { forwardRef } from "react";

import openaiLogo from "../../../../../brand/reference/agents/chatgpt-logo.svg";

/** The original black artwork on a quiet light backing, readable without recoloring either theme. */
export const CodexLogo: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function CodexLogo(
  { size = 24, ...props },
  ref,
) {
  return (
    <svg
      {...props}
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="3" fill="var(--agent-artwork-backdrop)" stroke="none" />
      <image href={openaiLogo} width="24" height="24" />
    </svg>
  );
});
