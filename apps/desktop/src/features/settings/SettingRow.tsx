import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface SettingRowProps {
  id: string;
  label: string;
  description: string;
  /** Whether the value differs from the default. Only then is there something to reset. */
  modified: boolean;
  /** Puts the setting back to its default. */
  onReset: () => Promise<unknown>;
  children: ReactNode;
}

const controls = '[role="radio"][aria-checked="true"], [role="switch"], [role="slider"], input';

/** One setting: its name, what it does, its control, and a way to put it back to its default. */
export function SettingRow({
  id,
  label,
  description,
  modified,
  onReset,
  children,
}: SettingRowProps) {
  const { t } = useTranslation();
  const control = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id={`${id}-label`} className="text-sm font-medium">
            {label}
          </h2>
          <p id={`${id}-description`} className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        {modified ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("settings.reset", { name: label })}
            onClick={() => {
              // The button disappears once the setting is back to its default, so focus moves to
              // the control instead of being lost.
              void onReset().then(() => {
                control.current?.querySelector<HTMLElement>(controls)?.focus();
              });
            }}
          >
            {t("settings.resetButton")}
          </Button>
        ) : null}
      </div>
      <div ref={control}>{children}</div>
    </div>
  );
}
