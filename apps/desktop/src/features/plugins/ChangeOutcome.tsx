import { useTranslation } from "react-i18next";

import type { PluginChange } from "@/ipc/bindings";
import { toAppError } from "@/lib/errors";

import { PluginsProblem } from "./PluginsProblem";

/**
 * What a change to plugins or marketplaces came to (ADR 0053), announced politely: under way, then
 * Claude Code's own message and whether a session waits for its next start, or why it did not
 * happen. A command shown to be accepted is the confirmation's to tell, not this line's.
 */
export function ChangeOutcome({
  underWay,
  change,
}: {
  /** What is said while the change runs. */
  underWay: string;
  change: { isPending: boolean; data: PluginChange | undefined; error: unknown };
}) {
  const { t } = useTranslation();
  const done = change.data && !change.data.shownCommand ? change.data : undefined;

  return (
    <>
      <div aria-live="polite" className="text-xs empty:hidden">
        {change.isPending ? underWay : null}
        {done?.message}
        {done?.sessionsWaiting ? (
          <p className="text-muted-foreground">{t("plugins.waiting")}</p>
        ) : null}
      </div>
      {change.error ? <PluginsProblem error={toAppError(change.error)} /> : null}
    </>
  );
}
