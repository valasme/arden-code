import { useEffect, useSyncExternalStore } from "react";

import {
  motionIsReduced,
  paintAppearance,
  paintMotion,
  subscribeToWindowsMotion,
  windowsReducesMotion,
} from "@/lib/appearance";
import { applyTheme } from "@/lib/theme";

import { useSystemPreferences } from "./systemPreferences";
import { useSettings } from "./useSettings";

/**
 * Puts the appearance settings on the page, and keeps them there as they change: the theme, the
 * zoom (with the Windows text size), the code font size and ligatures, and whether motion is
 * reduced. Draws nothing.
 */
export function AppearanceFromSettings() {
  const { theme, zoom, followTextSize, codeFontSize, codeLigatures, reduceMotion } =
    useSettings().appearance;
  const { textScalePercent } = useSystemPreferences();
  const systemReduces = useSyncExternalStore(subscribeToWindowsMotion, windowsReducesMotion);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    paintAppearance(
      document.documentElement,
      { zoom, followTextSize, codeFontSize, codeLigatures },
      textScalePercent,
    );
  }, [zoom, followTextSize, codeFontSize, codeLigatures, textScalePercent]);

  const reduce = motionIsReduced(reduceMotion, systemReduces);
  useEffect(() => {
    paintMotion(document.documentElement, reduce);
  }, [reduce]);

  return null;
}
