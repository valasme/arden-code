import { useTranslation } from "react-i18next";

/** The agent's reasoning, folded away until the person opens it. */
export function ThinkingItem({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();

  return (
    <details className="group my-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">
        {streaming ? t("items.thinking.running") : t("items.thinking.done")}
      </summary>
      <p className="mt-1 border-l-2 border-border pl-3 whitespace-pre-wrap">{text}</p>
    </details>
  );
}
