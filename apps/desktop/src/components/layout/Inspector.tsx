import { useTranslation } from "react-i18next";

/** Details of the open session: diffs, files and a terminal, later. Hidden by default. */
export function Inspector({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();

  return (
    <aside
      data-area="inspector"
      aria-label={t("regions.inspector")}
      hidden={hidden}
      className="flex h-full min-w-0 flex-col gap-2 bg-card p-3 text-card-foreground"
    >
      <h2 className="text-sm font-medium">{t("inspector.title")}</h2>
      <p className="text-xs text-muted-foreground">{t("inspector.empty")}</p>
    </aside>
  );
}
