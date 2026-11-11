import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { AgentKind } from "@/ipc/bindings";

/**
 * Asks whether the person trusts a folder before a local agent works in it: Claude Code
 * runs a project's own hooks, MCP servers and environment without asking. `onAnswer` hears the
 * answer once; closing the dialog any other way is Cancel.
 */
export function TrustDialog({
  agent = "claude",
  name,
  path,
  onAnswer,
}: {
  agent?: AgentKind;
  name: string;
  path: string;
  onAnswer: (trusted: boolean) => void;
}) {
  const { t } = useTranslation();
  const answered = useRef(false);
  // The message box had the focus, and gets it back: the dialog has no trigger of its own.
  const [returnFocusTo] = useState(() => document.activeElement);
  const answer = (trusted: boolean) => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(trusted);
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
      title={t("sessions.trust.title", { name })}
      description={t(
        agent === "codex" ? "sessions.trust.codexDescription" : "sessions.trust.description",
        { path },
      )}
      confirmLabel={t("sessions.trust.confirm")}
      onConfirm={() => {
        answer(true);
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
          returnFocusTo.focus();
        }
      }}
    />
  );
}
