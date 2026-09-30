import { useMemo } from "react";

import { createFormatters, regionalLocale, type Formatters } from "@/lib/format";

import { useSystemPreferences } from "./systemPreferences";
import { useSettings } from "./useSettings";

/**
 * Writes dates, numbers and relative times in the regional format: the one chosen in Windows, or
 * English (US) when General → Regional format says so. Use this instead of `toLocaleString`, which
 * would follow the language of the interface.
 */
export function useFormatters(): Formatters & { locale: string } {
  const { regionalFormat } = useSettings().general;
  const { locale: windowsLocale } = useSystemPreferences();
  const locale = regionalLocale(regionalFormat, windowsLocale);

  return useMemo(() => ({ ...createFormatters(locale), locale }), [locale]);
}
