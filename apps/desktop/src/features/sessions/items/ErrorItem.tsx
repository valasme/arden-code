import { CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Something the agent reports as having gone wrong. */
export function ErrorItem({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <div className="my-2 flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
      <p className="min-w-0 break-words">
        <span className="font-medium">{t("items.error.label")}</span> {message}
      </p>
    </div>
  );
}
