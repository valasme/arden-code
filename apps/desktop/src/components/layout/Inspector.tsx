import { useTranslation } from "react-i18next";

/**
 * Details of the open session: diffs, files and a terminal, later. Hidden by default. Its header
 * lines up with the session view's.
 */
export function Inspector({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();

  return (
    <aside
      data-area="inspector"
      aria-label={t("regions.inspector")}
      hidden={hidden}
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <header className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <h2 className="truncate text-sm font-medium">{t("inspector.title")}</h2>
      </header>
      <p className="p-4 text-xs text-muted-foreground">{t("inspector.empty")}</p>
    </aside>
  );
}
