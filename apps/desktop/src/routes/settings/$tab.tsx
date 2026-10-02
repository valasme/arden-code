import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AgentsTab } from "@/features/agents/AgentsTab";
import { NotificationsTab } from "@/features/notifications/NotificationsTab";
import { AboutTab } from "@/features/settings/AboutTab";
import { AdvancedTab } from "@/features/settings/AdvancedTab";
import { KeyboardTab } from "@/features/settings/KeyboardTab";
import { SettingsList } from "@/features/settings/SettingsList";
import { isSettingsTab, type SettingsTab } from "@/features/settings/tabs";

export const Route = createFileRoute("/settings/$tab")({
  beforeLoad: ({ params }) => {
    if (!isSettingsTab(params.tab)) throw notFound();
  },
  component: SettingsTabPage,
});

/** What a tab holds. */
function TabContent({ tab }: { tab: SettingsTab }) {
  const navigate = useNavigate();

  switch (tab) {
    case "general":
    case "appearance": {
      return <SettingsList tab={tab} />;
    }
    case "keyboard": {
      return <KeyboardTab />;
    }
    case "advanced": {
      return (
        <AdvancedTab
          onViewLogs={() => {
            void navigate({ to: "/logs" });
          }}
        />
      );
    }
    case "notifications": {
      return <NotificationsTab />;
    }
    case "agents": {
      return <AgentsTab />;
    }
    case "about": {
      break;
    }
  }
  return <AboutTab />;
}

/** A settings tab. */
function SettingsTabPage() {
  const { t } = useTranslation();
  const { tab } = Route.useParams();
  // beforeLoad has already turned away tabs that do not exist.
  if (!isSettingsTab(tab)) return null;

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{t(`settings.tabs.${tab}`)}</h1>
      <TabContent tab={tab} />
    </>
  );
}
