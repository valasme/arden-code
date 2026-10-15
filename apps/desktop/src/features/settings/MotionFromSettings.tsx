import { domMax, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { useMotionReduced } from "./useMotionReduced";

/**
 * Lets Motion move what React adds, removes or moves (ADR 0054), and stops it with reduced motion,
 * as base.css stops CSS. It takes both of Motion's switches: `skipAnimations` sets values such as
 * opacity at once, and `reducedMotion` puts a moved element in its new place at once; neither stops
 * both. Motion follows the app's setting, never Windows' own, which the setting can overrule.
 * `strict` refuses a full `motion` component, which would load all of Motion.
 */
export function MotionFromSettings({ children }: { children: ReactNode }) {
  const reduce = useMotionReduced();

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig skipAnimations={reduce} reducedMotion={reduce ? "always" : "never"}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
