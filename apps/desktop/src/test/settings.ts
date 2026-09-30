import type { Settings } from "@/ipc/bindings";
import { defaultSettings } from "@/ipc/defaults.gen";

interface Overrides {
  general?: Partial<Settings["general"]>;
  appearance?: Partial<Settings["appearance"]>;
  layout?: Partial<Settings["layout"]>;
  keyboard?: Partial<Settings["keyboard"]>;
  advanced?: Partial<Settings["advanced"]>;
}

/** The default settings with some values changed, as Rust would send them. */
export function settingsWith({
  general,
  appearance,
  layout,
  keyboard,
  advanced,
}: Overrides = {}): Settings {
  return {
    ...defaultSettings,
    general: { ...defaultSettings.general, ...general },
    appearance: { ...defaultSettings.appearance, ...appearance },
    layout: { ...defaultSettings.layout, ...layout },
    keyboard: { ...defaultSettings.keyboard, ...keyboard },
    advanced: { ...defaultSettings.advanced, ...advanced },
  };
}
