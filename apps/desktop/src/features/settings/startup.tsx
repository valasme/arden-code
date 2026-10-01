import { createContext, type ReactNode, useContext } from "react";

import type { Settings } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";

const StartupSettingsContext = createContext<Settings | undefined>(undefined);

/** Holds the settings the app started with, for the ones that only take effect at the next start. */
export function StartupSettingsProvider({
  settings,
  children,
}: {
  settings: Settings | undefined;
  children: ReactNode;
}) {
  return (
    <StartupSettingsContext.Provider value={settings}>{children}</StartupSettingsContext.Provider>
  );
}

/** The settings as they were when the app started. */
export function useStartupSettings(): Settings {
  return useContext(StartupSettingsContext) ?? defaultSettings;
}
