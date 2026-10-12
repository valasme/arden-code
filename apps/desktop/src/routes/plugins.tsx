import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/plugins")({
  component: PluginsLayout,
});

/**
 * The Plugins page (ADR 0053): like Settings, a centered column that scrolls by itself, its search
 * and tabs in the sidebar. A line under the title says what plugins bring.
 */
function PluginsLayout() {
  const { t } = useTranslation();

  return (
    <main className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-[48rem] px-6 pt-8 pb-12">
        <PageHeader title={t("plugins.title")} description={t("plugins.description")} />
        <Outlet />
      </div>
    </main>
  );
}
