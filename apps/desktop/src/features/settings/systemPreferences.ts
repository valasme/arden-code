import { useQuery } from "@tanstack/react-query";

import type { SystemPreferences } from "@/ipc/bindings";
import { systemPreferencesQuery } from "@/ipc/queries";

/**
 * What to use where there is no Rust to ask, such as a plain browser during development: the normal
 * text size, and the language the browser is set to.
 */
export function fallbackSystemPreferences(): SystemPreferences {
  return { textScalePercent: 100, locale: globalThis.navigator?.language ?? "en-US" };
}

/** The Windows text size and regional format now. They change while the app runs. */
export function useSystemPreferences(): SystemPreferences {
  return useQuery(systemPreferencesQuery).data ?? fallbackSystemPreferences();
}
