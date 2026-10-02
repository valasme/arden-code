import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { ActionRow } from "@/features/settings/ActionRow";
import { SettingsList } from "@/features/settings/SettingsList";
import { commands } from "@/ipc/bindings";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/** Settings → Notifications: whether Windows notifications are shown, and a way to see one. */
export function NotificationsTab() {
  const { t } = useTranslation();

  const sendTest = () => {
    commands
      .sendTestNotification()
      .then((shown) => {
        // Rust decides. With notifications off it shows nothing, and this says why.
        if (shown) toast.success(t("settings.notifications.sent"));
        else toast.info(t("settings.notifications.off"));
      })
      .catch((error: unknown) => {
        showErrorToast(toAppError(error));
      });
  };

  return (
    <div>
      <SettingsList tab="notifications" />
      <div className="mt-4 border border-border">
        <ActionRow
          id="test-notification"
          label={t("settings.notifications.test.label")}
          description={t("settings.notifications.test.description")}
          button={t("settings.notifications.test.button")}
          onClick={sendTest}
        />
      </div>
    </div>
  );
}
