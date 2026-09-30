import { useEffect } from "react";

import { applyTheme } from "@/lib/theme";

import { useSettings } from "./useSettings";

/** Puts the theme from the settings on the page, and keeps it there as the setting changes. */
export function ThemeFromSettings() {
  const { theme } = useSettings().appearance;

  useEffect(() => applyTheme(theme), [theme]);

  return null;
}
