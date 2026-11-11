import { ShieldIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Codex's initial native policy is fixed and is never presented as Claude's Manual mode. */
export function CodexPolicy() {
  const { t } = useTranslation();
  return (
    <span
      className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"
      aria-label={t("agents.codex.policyLabel")}
    >
      <ShieldIcon aria-hidden className="size-3.5" strokeWidth={1.5} />
      {t("agents.codex.readOnly")}
    </span>
  );
}
