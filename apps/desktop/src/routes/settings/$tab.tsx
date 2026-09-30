import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppearanceTab } from "@/features/settings/AppearanceTab";
import { isSettingsTab } from "@/features/settings/tabs";

export const Route = createFileRoute("/settings/$tab")({
  beforeLoad: ({ params }) => {
    if (!isSettingsTab(params.tab)) throw notFound();
  },
  component: SettingsTabPage,
});

/** A settings tab. Tabs without settings yet say so. */
function SettingsTabPage() {
  const { t } = useTranslation();
  const { tab } = Route.useParams();
  // beforeLoad has already turned away tabs that do not exist.
  if (!isSettingsTab(tab)) return null;

  return (
    <main className="max-w-xl p-6">
      <h1 className="mb-2 text-xl font-semibold">{t(`settings.tabs.${tab}`)}</h1>
      {tab === "appearance" ? (
        <AppearanceTab />
      ) : (
        <p className="text-sm text-muted-foreground">{t("settings.placeholder")}</p>
      )}
    </main>
  );
}
