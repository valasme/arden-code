import { Link, useRouterState } from "@tanstack/react-router";
import { BlocksIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ArchivedLink } from "@/features/sessions/ArchivedLink";
import { SessionsNav } from "@/features/sessions/SessionsNav";
import { PluginsNav } from "@/features/plugins/PluginsNav";
import { firstPluginsTab } from "@/features/plugins/tabs";
import { SettingsNav } from "@/features/settings/SettingsNav";
import { isPluginsPage } from "@/state/pluginsPage";
import { isSettingsPage } from "@/state/settingsPage";

import { ShortcutHint } from "./ShortcutHint";
import { sidebarRow } from "./sidebarRow";

/**
 * Projects and their sessions, with the ways into Plugins and Settings. On a settings page or the
 * Plugins page it shows that page's tabs instead, so the window never has two sidebars (ADR 0032,
 * ADR 0053).
 */
export function Sidebar({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const inSettings = useRouterState({ select: (state) => isSettingsPage(state.location.pathname) });
  const inPlugins = useRouterState({ select: (state) => isPluginsPage(state.location.pathname) });

  return (
    <aside
      data-area="sidebar"
      aria-label={t("regions.sidebar")}
      hidden={hidden}
      className="@container/sidebar flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      {inSettings || inPlugins ? (
        <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2">
          {inSettings ? <SettingsNav /> : <PluginsNav />}
        </div>
      ) : (
        <>
          <nav
            aria-label={t("sidebar.navigation")}
            className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2"
          >
            <SessionsNav />
          </nav>
          <div className="flex flex-col gap-px border-t border-sidebar-border p-2">
            <ArchivedLink />
            <Link to="/plugins/$tab" params={{ tab: firstPluginsTab }} className={sidebarRow}>
              <BlocksIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
              {t("sidebar.plugins")}
              <ShortcutHint command="plugins.open" />
            </Link>
            <Link to="/settings/$tab" params={{ tab: "general" }} className={sidebarRow}>
              <SettingsIcon
                aria-hidden
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              {t("sidebar.settings")}
              <ShortcutHint command="settings.open" />
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
