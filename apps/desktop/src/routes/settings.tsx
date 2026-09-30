import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsTabs } from "@/features/settings/SettingsTabs";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

/** The Settings page: the tabs on the left, the open tab on the right. */
function SettingsLayout() {
  return (
    <div className="flex min-h-full">
      <SettingsTabs />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
