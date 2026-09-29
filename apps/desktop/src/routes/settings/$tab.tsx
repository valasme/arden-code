import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { isSettingsTab } from "@/features/settings/tabs";

export const Route = createFileRoute("/settings/$tab")({
  beforeLoad: ({ params }) => {
    if (!isSettingsTab(params.tab)) throw notFound();
  },
  component: SettingsTabPage,
});

/** A settings tab. The tab navigation and the settings themselves arrive with the settings tickets. */
function SettingsTabPage() {
  const { t } = useTranslation();
  const { tab } = Route.useParams();
  // beforeLoad has already turned away tabs that do not exist.
  if (!isSettingsTab(tab)) return null;

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{t(`settings.tabs.${tab}`)}</h1>
    </main>
  );
}
