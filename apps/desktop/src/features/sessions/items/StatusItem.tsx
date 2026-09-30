import { useTranslation } from "react-i18next";

import type { StatusKind } from "@/ipc/bindings";

/** A line between the parts of a reply, such as where the agent started or was stopped. */
export function StatusItem({ kind }: { kind: StatusKind }) {
  const { t } = useTranslation();

  return (
    <p className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {t(`items.status.${kind}`)}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </p>
  );
}
