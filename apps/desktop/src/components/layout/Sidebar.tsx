import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Projects and their sessions, with the way into Settings. */
export function Sidebar({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={t("regions.sidebar")}
      hidden={hidden}
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <nav aria-label={t("sidebar.navigation")} className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <h2 className="px-2 pt-1 text-xs font-medium text-muted-foreground">
          {t("sidebar.projects")}
        </h2>
        <p className="px-2 text-xs text-muted-foreground">{t("sidebar.noSessions")}</p>
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <Link
          to="/settings/$tab"
          params={{ tab: "general" }}
          className="flex h-7 items-center gap-2 px-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:font-medium forced-colors:[&.active]:underline"
        >
          <SettingsIcon aria-hidden className="size-4" strokeWidth={1.5} />
          {t("sidebar.settings")}
        </Link>
      </div>
    </aside>
  );
}
