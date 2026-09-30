import { useEffect, useSyncExternalStore } from "react";

import {
  motionIsReduced,
  paintAppearance,
  paintMotion,
  subscribeToWindowsMotion,
  windowsReducesMotion,
} from "@/lib/appearance";
import { applyTheme } from "@/lib/theme";

import { useSettings } from "./useSettings";

/**
 * Puts the appearance settings on the page, and keeps them there as they change: the theme, the
 * zoom, the code font size and ligatures, and whether motion is reduced. Draws nothing.
 */
export function AppearanceFromSettings() {
  const { theme, zoom, codeFontSize, codeLigatures, reduceMotion } = useSettings().appearance;
  const systemReduces = useSyncExternalStore(subscribeToWindowsMotion, windowsReducesMotion);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    paintAppearance(document.documentElement, { zoom, codeFontSize, codeLigatures });
  }, [zoom, codeFontSize, codeLigatures]);

  const reduce = motionIsReduced(reduceMotion, systemReduces);
  useEffect(() => {
    paintMotion(document.documentElement, reduce);
  }, [reduce]);

  return null;
}
