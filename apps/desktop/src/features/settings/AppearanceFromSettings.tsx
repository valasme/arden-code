import { useEffect } from "react";

import { paintAppearance, paintMotion } from "@/lib/appearance";
import { applyTheme } from "@/lib/theme";

import { useSystemPreferences } from "./systemPreferences";
import { useMotionReduced } from "./useMotionReduced";
import { useSettings } from "./useSettings";

/**
 * Puts the appearance settings on the page, and keeps them there as they change: the theme, the
 * zoom (with the Windows text size), the code font size and ligatures, and whether motion is
 * reduced. Draws nothing.
 */
export function AppearanceFromSettings() {
  const { theme, zoom, followTextSize, codeFontSize, codeLigatures } = useSettings().appearance;
  const { textScalePercent } = useSystemPreferences();

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    paintAppearance(
      document.documentElement,
      { zoom, followTextSize, codeFontSize, codeLigatures },
      textScalePercent,
    );
  }, [zoom, followTextSize, codeFontSize, codeLigatures, textScalePercent]);

  const reduce = useMotionReduced();
  useEffect(() => {
    paintMotion(document.documentElement, reduce);
  }, [reduce]);

  return null;
}
