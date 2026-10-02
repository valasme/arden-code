import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsSearchResults } from "@/features/settings/SettingsSearchResults";
import { useSettingsPageStore } from "@/state/settingsPage";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

/**
 * The Settings page: a centered column that scrolls by itself, so the tabs in the sidebar stay
 * still. It keeps the scrollbar's room on a tab too short to scroll, so the column does not jump
 * sideways between a short tab and a long one. While something is typed in the sidebar's search,
 * the results from every tab take the place of the tab.
 */
function SettingsLayout() {
  const query = useSettingsPageStore((state) => state.query);
  const searching = query.trim() !== "";

  return (
    <main className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-[40rem] px-6 pt-8 pb-12">
        {searching ? <SettingsSearchResults query={query} /> : <Outlet />}
      </div>
    </main>
  );
}
