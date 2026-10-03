import { Link, useRouterState } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ArchivedLink } from "@/features/sessions/ArchivedBar";
import { SessionsNav } from "@/features/sessions/SessionsNav";
import { SettingsNav } from "@/features/settings/SettingsNav";
import { isSettingsPage } from "@/state/settingsPage";

import { ShortcutHint } from "./ShortcutHint";
import { sidebarRow } from "./sidebarRow";

/**
 * Projects and their sessions, with the way into Settings. On a settings page it shows the
 * settings tabs instead, so the window never has two sidebars (ADR 0032).
 */
export function Sidebar({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const inSettings = useRouterState({ select: (state) => isSettingsPage(state.location.pathname) });

  return (
    <aside
      data-area="sidebar"
      aria-label={t("regions.sidebar")}
      hidden={hidden}
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      {inSettings ? (
        <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2">
          <SettingsNav />
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
