import { useSyncExternalStore } from "react";

import { motionIsReduced, subscribeToWindowsMotion, windowsReducesMotion } from "@/lib/appearance";

import { useSettings } from "./useSettings";

/**
 * Whether motion is reduced: the Reduce motion setting, or Windows asking for fewer animations when
 * the setting follows it. CSS reads it from the root (base.css), Motion from `MotionFromSettings`.
 */
export function useMotionReduced() {
  const { reduceMotion } = useSettings().appearance;
  const systemReduces = useSyncExternalStore(subscribeToWindowsMotion, windowsReducesMotion);
  return motionIsReduced(reduceMotion, systemReduces);
}
