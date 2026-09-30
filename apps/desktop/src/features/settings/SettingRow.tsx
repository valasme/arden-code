import type { ReactNode } from "react";

interface SettingRowProps {
  id: string;
  label: string;
  description: string;
  children: ReactNode;
}

/** One setting: its name, what it does, and its control. */
export function SettingRow({ id, label, description, children }: SettingRowProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-label`} className="text-sm font-medium">
          {label}
        </h2>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
