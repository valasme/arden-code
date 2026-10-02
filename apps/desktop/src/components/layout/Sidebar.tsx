import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SessionsNav } from "@/features/sessions/SessionsNav";

import { ShortcutHint } from "./ShortcutHint";
import { sidebarRow } from "./sidebarRow";

/** Projects and their sessions, with the way into Settings. */
export function Sidebar({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();

  return (
    <aside
      data-area="sidebar"
      aria-label={t("regions.sidebar")}
      hidden={hidden}
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <nav
        aria-label={t("sidebar.navigation")}
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2"
      >
        <SessionsNav />
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <Link to="/settings/$tab" params={{ tab: "general" }} className={sidebarRow}>
          <SettingsIcon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.5} />
          {t("sidebar.settings")}
          <ShortcutHint command="settings.open" />
        </Link>
      </div>
    </aside>
  );
}
