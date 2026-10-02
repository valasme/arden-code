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

/**
 * One setting: its name, what it does, its control at the end of the row (under the text when the
 * row is narrow), and a way to put it back to its default.
 */
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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 id={`${id}-label`} className="text-sm font-medium">
            {label}
          </h2>
          {modified ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
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
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <div ref={control} className="flex max-w-full flex-col items-end gap-2">
        {children}
      </div>
    </div>
  );
}
