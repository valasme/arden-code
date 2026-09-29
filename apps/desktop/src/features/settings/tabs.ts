/** The tabs of the Settings page, in the order they are listed (plan section 6.3). */
export const settingsTabs = [
  "general",
  "appearance",
  "keyboard",
  "notifications",
  "agents",
  "advanced",
  "about",
] as const;

export type SettingsTab = (typeof settingsTabs)[number];

export function isSettingsTab(value: string): value is SettingsTab {
  return (settingsTabs as readonly string[]).includes(value);
}
